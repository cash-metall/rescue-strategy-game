import { describe, it, expect } from 'vitest';
import {
  newGame, simMinute, actBuild, actHire, dispatchUnit, heatScores, travelTime,
  cellAt, targetable, inRange, activeMissions,
  MISSCAP, TENTCAP, TYPES, BUILD, DEFAULT_CAMPAIGN,
  type Game, type Fx,
} from '../engine';

const noop = (_fx: Fx) => {};

interface Result { win: boolean; timeout: boolean; err: Error | null; }

function playGame(strategy: 'smart' | 'naive'): Result {
  const g: Game = newGame(DEFAULT_CAMPAIGN());
  const MAXT = 6000;
  let lastDecision = -999, buildStep = 0;
  const buildPlan: (keyof typeof BUILD)[] = ['carto', 'rest', 'radio'];
  let err: Error | null = null;
  try {
    while (!g.over && g.t < MAXT) {
      if (g.t - lastDecision >= 10) {
        lastDecision = g.t;
        if (strategy !== 'naive') {
          while (g.units.length < TENTCAP[g.buildings.tent] && g.funds >= TYPES.foot.cost && g.units.length < 4) {
            actHire(g, 'foot', noop);
          }
          if (g.buildings.tent < 2 && g.funds > 300) actBuild(g, 'tent', noop);
          if (buildStep < buildPlan.length) {
            const key = buildPlan[buildStep];
            const cur = g.buildings[key], cost = BUILD[key].costs[cur + 1];
            if (cur < BUILD[key].max && g.funds >= cost) { actBuild(g, key, noop); buildStep++; }
          }
        }
        // компетентный игрок: помечает находки идеально
        for (const c of g.clues) { if (!c.verdict) c.mark = c.kind === 'art' ? 'real' : 'junk'; }
        // отправка свободных отрядов
        const heat = heatScores(g);
        const targeted = new Set(g.units.filter(u => u.mission).map(u => u.mission!.x + ',' + u.mission!.y));
        for (const u of g.units) {
          if (u.status !== 'idle') continue;
          if (u.type !== 'drone' && u.fatigue >= 85) continue;
          if (u.type === 'drone' && u.fatigue > 60) continue;
          if (activeMissions(g) >= MISSCAP[g.buildings.radio]) break;
          let best = null, bestScore = -1;
          for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
            const cell = cellAt(g, x, y);
            if (!targetable(cell) || !inRange(g, cell)) continue;
            if (cell.coverage >= 75) continue;
            if (targeted.has(x + ',' + y)) continue;
            let s = strategy === 'naive' ? 1 / (1 + Math.hypot(x - g.lkp.x, y - g.lkp.y)) : heat[y][x];
            s -= travelTime(g, u, cell) * 0.0006;
            if (s > bestScore) { bestScore = s; best = cell; }
          }
          if (best) { dispatchUnit(g, u, best); targeted.add(best.x + ',' + best.y); }
        }
      }
      simMinute(g, noop);
    }
  } catch (e) { err = e as Error; }
  return { win: !!(g.over && g.over.win), timeout: !g.over, err };
}

describe('авто-игрок (баланс/winnability)', () => {
  it('компетентная стратегия выигрывает большинство дел, ноль исключений', () => {
    const N = 120;
    let wins = 0, errors = 0, timeouts = 0;
    for (let i = 0; i < N; i++) {
      const r = playGame('smart');
      if (r.err) errors++;
      else if (r.win) wins++;
      else if (r.timeout) timeouts++;
    }
    expect(errors).toBe(0);
    expect(timeouts).toBe(0);
    expect(wins / N).toBeGreaterThan(0.5);
    expect(wins / N).toBeLessThanOrEqual(1);
  }, 60000);

  it('наивная стратегия (у ТПК, без развития) не выигрывает', () => {
    const N = 60;
    let wins = 0, errors = 0;
    for (let i = 0; i < N; i++) {
      const r = playGame('naive');
      if (r.err) errors++;
      else if (r.win) wins++;
    }
    expect(errors).toBe(0);
    expect(wins).toBe(0);
  }, 60000);
});
