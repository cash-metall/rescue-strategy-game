import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  newGame, simMinute, actBuild, actHire, actSend, actQuest, actAbandon, heatScores, planTrip,
  cellAt, targetable, inRange, missionSlots, available, setRng, resetRng,
  TENTCAP, TYPES, BUILD, DEFAULT_CAMPAIGN,
  type Game, type Fx, type Outcome,
} from '../engine';

const noop = (_fx: Fx) => {};

/**
 * Балансный прогон идёт на СИДИРОВАННОМ PRNG (шов setRng из engine/rng.ts).
 * Иначе пороги ниже флакуют от запуска к запуску, и «регресс баланса» невозможно
 * отличить от неудачной серии бросков.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(() => setRng(mulberry32(20260729)));
afterAll(() => resetRng());

interface Result { outcome: Outcome | null; timeout: boolean; err: Error | null; t: number; }

/**
 * Дело больше не заканчивается само (медики уезжают, поиск продолжается), поэтому
 * лимит времени большой, а метрика — не «доля побед», а доля дел, закрытых ДО ухода медиков.
 */
function playGame(strategy: 'smart' | 'naive'): Result {
  const g: Game = newGame(DEFAULT_CAMPAIGN());
  const MAXT = 20000;
  let lastDecision = -999, buildStep = 0;
  // Радиостанция первой: 40% карт держат пропавшего вне стартового радиуса связи,
  // и без апгрейда до него просто не дотянуться.
  const buildPlan: (keyof typeof BUILD)[] = ['radio', 'carto', 'rest', 'radio', 'radio'];
  let err: Error | null = null;
  try {
    while (!g.over && g.t < MAXT) {
      // найден живым после ухода медиков — проходим мини-квест (первый вариант всегда верный)
      if (g.quest) { actQuest(g, 0, noop); continue; }

      if (g.t - lastDecision >= 10) {
        lastDecision = g.t;
        if (strategy !== 'naive') {
          while (g.units.filter(u => u.type === 'foot' && !u.away).length < 4
                 && g.units.length < TENTCAP[g.buildings.tent] && g.funds >= TYPES.foot.cost) {
            actHire(g, 'foot', noop);
          }
          if (g.buildings.tent < 2 && g.funds > 300) actBuild(g, 'tent', noop);
          // шатёр забит выбывшими — расширяем, чтобы взять замену
          if (g.units.length >= TENTCAP[g.buildings.tent] && g.units.some(u => u.away)
              && g.buildings.tent < BUILD.tent.max
              && g.funds >= BUILD.tent.costs[g.buildings.tent + 1]) {
            actBuild(g, 'tent', noop);
          }
          // один «Ветер» — чтобы путь доставки тоже прогонялся
          if (g.buildings.tent >= 2 && !g.units.some(u => u.type === 'wind')
              && g.units.length < TENTCAP[g.buildings.tent] && g.funds >= TYPES.wind.cost + 200) {
            actHire(g, 'wind', noop);
          }
          if (buildStep < buildPlan.length) {
            const key = buildPlan[buildStep];
            const cur = g.buildings[key], cost = BUILD[key].costs[cur + 1];
            if (cur < BUILD[key].max && g.funds >= cost) { actBuild(g, key, noop); buildStep++; }
          }
        }
        // компетентный игрок: помечает находки идеально
        for (const c of g.clues) { if (!c.verdict) c.mark = c.kind === 'art' ? 'real' : 'junk'; }

        const heat = heatScores(g);
        const targeted = new Set(g.units.filter(u => u.mission).map(u => u.mission!.x + ',' + u.mission!.y));
        let dispatched = 0;
        for (const u of g.units) {
          if (u.type === 'wind') continue;                 // транспорт сам себя не отправляет
          if (!available(g, u)) continue;
          if (u.type !== 'drone' && u.fatigue >= 50) continue;   // выйти надо с запасом сил на полный проход
          if (u.type === 'drone' && u.fatigue > 60) continue;
          if (missionSlots(g) <= 0) break;
          // Единая оценка: вероятность минус уже проделанная работа минус дорога.
          // Важно, что осмотренный квадрат не исключается, а лишь теряет в приоритете —
          // иначе пропущенный (осмотрен, но пусто) квадрат с высокой вероятностью
          // никогда не был бы прочёсан заново, и поиск вставал бы навсегда.
          let best = null, bestScore = -Infinity;
          for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
            const cell = cellAt(g, x, y);
            if (!targetable(cell) || !inRange(g, cell)) continue;
            if (targeted.has(x + ',' + y)) continue;
            let s = strategy === 'naive' ? 1 / (1 + Math.hypot(x - g.lkp.x, y - g.lkp.y)) : heat[y][x];
            // осмотренный квадрат сохраняет лишь 15% своей привлекательности:
            // сначала прочешем новое, а когда нового не останется — вернёмся к самому вероятному
            s *= 1 - 0.85 * (cell.coverage / 100);
            s -= planTrip(g, u, cell).travel * 0.0006;
            if (s > bestScore) { bestScore = s; best = cell; }
          }
          if (best) {
            g.ui.sel = { x: best.x, y: best.y };
            g.ui.selUnits.clear();
            g.ui.selUnits.add(u.id);
            if (actSend(g, noop).ok) { dispatched++; targeted.add(best.x + ',' + best.y); }
          }
        }
        // Софтлок: искать почти некем и дело безнадёжно затянулось — игрок сворачивает поиск.
        const usable = g.units.filter(u => u.type !== 'wind' && !u.away).length;
        const canHire = g.units.length < TENTCAP[g.buildings.tent] && g.funds >= TYPES.foot.cost;
        const stuck = usable === 0 && !canHire && !g.units.some(u => u.mission);
        // дело тянется вторую неделю и искать почти некем — живой игрок здесь сворачивается
        if (stuck || (usable < 2 && g.t > 12000)) {
          actAbandon(g, noop);
          break;
        }
      }
      simMinute(g, noop);
    }
  } catch (e) { err = e as Error; }
  return { outcome: g.over ? g.over.outcome : null, timeout: !g.over, err, t: g.t };
}

describe('авто-игрок (баланс/winnability)', () => {
  it('компетентная стратегия находит пропавшего, чаще всего до ухода медиков', () => {
    const N = 40;
    const tally: Record<string, number> = { alive: 0, 'alive-late': 0, dead: 0, abandoned: 0 };
    let errors = 0, timeouts = 0;
    for (let i = 0; i < N; i++) {
      const r = playGame('smart');
      if (r.err) { errors++; continue; }
      if (r.timeout) { timeouts++; continue; }
      tally[r.outcome as string]++;
    }
    expect(errors).toBe(0);
    // Просрочек по лимиту почти не бывает, но нулю они не равны: если все группы выбыли
    // по травмам, оставшийся отряд доигрывает дело неделями. Это спроектированная
    // «спираль травм», и живой игрок в такой ситуации нажимает «Свернуть поиск» —
    // эвристика бота этот момент угадывает хуже человека. Порог ловит настоящий регресс
    // (когда дела становятся системно недоигрываемыми), не карая за штатный тупик.
    expect(timeouts / N).toBeLessThanOrEqual(0.1);
    // сворачивать поиск приходится редко — только когда все группы выбыли по травмам
    expect(tally.abandoned / N).toBeLessThan(0.15);
    // пропавшего находят всегда — вопрос только в том, каким
    expect(tally.alive + tally['alive-late'] + tally.dead).toBeGreaterThan(N * 0.85);
    // основная метрика: доля дел, закрытых ДО ухода медиков
    expect(tally.alive / N).toBeGreaterThan(0.4);
  }, 120000);

  it('наивная стратегия (топчется у ТПК, без развития) почти не успевает вовремя', () => {
    const N = 20;
    let inTime = 0, errors = 0;
    for (let i = 0; i < N; i++) {
      const r = playGame('naive');
      if (r.err) errors++;
      else if (r.outcome === 'alive') inTime++;
    }
    expect(errors).toBe(0);
    expect(inTime / N).toBeLessThan(0.35);
  }, 120000);
});
