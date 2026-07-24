import { describe, it, expect } from 'vitest';
import { tryGen, DEFAULT_CAMPAIGN, cheb, type Game } from '../engine';

const N = 3000;

describe('генерация карты/дела', () => {
  const fresh = () => DEFAULT_CAMPAIGN();
  const games: Game[] = [];
  let fails = 0;
  for (let i = 0; i < N; i++) {
    const g = tryGen(fresh());
    if (!g) { fails++; continue; }
    games.push(g);
  }

  it('доля отбракованных генераций мала (ретраи всё покрывают)', () => {
    expect(fails / N).toBeLessThan(0.2);
    expect(games.length).toBeGreaterThan(N * 0.5);
  });

  it('маршрут 5–8 клеток, артефактов всегда ≥4', () => {
    for (const g of games) {
      expect(g.path.length).toBeGreaterThanOrEqual(5);
      expect(g.path.length).toBeLessThanOrEqual(8);
      let art = 0;
      for (const row of g.map) for (const c of row) for (const o of c.objects) if (o.kind === 'art') art++;
      expect(art).toBeGreaterThanOrEqual(4);
    }
  });

  it('жертва в пределах карты, дистанция от лагеря разумная', () => {
    for (const g of games) {
      expect(g.victim.x).toBeGreaterThanOrEqual(0);
      expect(g.victim.x).toBeLessThan(12);
      expect(g.victim.y).toBeGreaterThanOrEqual(0);
      expect(g.victim.y).toBeLessThan(12);
    }
    const life = games.map(g => 100 / g.drainBase);
    const avg = life.reduce((s, x) => s + x, 0) / life.length;
    expect(avg).toBeGreaterThan(1800);
    expect(avg).toBeLessThan(3600);
  });

  it('лагерь: 1–3 клетки от ТПК, на пустой клетке (не маршрут, без объектов, не жертва)', () => {
    let bad = 0;
    for (const g of games) {
      const hq = g.hq;
      const cell = g.map[hq.y][hq.x];
      const d = cheb(hq, g.lkp);
      const onTrail = g.trailSet.has(hq.x + ',' + hq.y);
      const hasObj = cell.objects.length > 0;
      const isVictim = hq.x === g.victim.x && hq.y === g.victim.y;
      if (d < 1 || d > 3 || onTrail || hasObj || isVictim || cell.terrain !== 'base') bad++;
    }
    expect(bad).toBe(0);
  });
});
