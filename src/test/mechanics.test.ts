import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  newGame, simMinute, dispatchUnit, addUnit, actSend, actAbandon, actTrain, actBuild,
  findPath, passable, planTrip, sendBlock, cellAt, coverRate, detectEff, searchEst,
  available, isBusy, freeWinds, windCapacity, incidentPool, rollEvent,
  forceReturn, windMinutes, unitCell, targetable,
  setRng, resetRng, DEFAULT_CAMPAIGN, LVL, EVENT_CHANCE, RECON_MIN, WIND_PASS,
  type Game, type Fx, type Unit, type UnitType,
} from '../engine';

const noop = (_fx: Fx) => {};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(() => setRng(mulberry32(4242)));
afterAll(() => resetRng());

const fresh = (): Game => newGame(DEFAULT_CAMPAIGN());
const hire = (g: Game, type: UnitType): Unit => { addUnit(g, type); return g.units[g.units.length - 1]; };
/** Прокрутить время до смены статуса отряда (или до лимита). */
function runUntil(g: Game, pred: () => boolean, limit = 5000): boolean {
  for (let i = 0; i < limit; i++) { if (pred()) return true; simMinute(g, noop); }
  return pred();
}

describe('поиск пути', () => {
  it('озеро непроходимо для всех, болото и чаща — только для «Ветра» ур. 3', () => {
    expect(passable('lake', 'foot', 1)).toBe(false);
    expect(passable('lake', 'wind', 3)).toBe(false);
    expect(passable('marsh', 'foot', 1)).toBe(true);
    expect(passable('marsh', 'wind', 1)).toBe(false);
    expect(passable('dense', 'wind', 2)).toBe(false);
    expect(passable('marsh', 'wind', 3)).toBe(true);
    expect(passable('dense', 'wind', 3)).toBe(true);
    // таблица проходимости и предикат не должны разъезжаться
    for (const lv of [1, 2, 3]) {
      for (const t of WIND_PASS[lv]) expect(passable(t, 'wind', lv)).toBe(true);
    }
  });

  it('путь пешего никогда не идёт через озеро', () => {
    for (let n = 0; n < 40; n++) {
      const g = fresh();
      const lakes = g.map.flat().filter(c => c.terrain === 'lake');
      if (!lakes.length) continue;
      const far = g.map.flat().filter(c => c.terrain !== 'lake')
        .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];
      const p = findPath(g, g.hq, far, 'foot');
      expect(p.reached).toBe(true);
      expect(p.cells.some(c => g.map[c.y][c.x].terrain === 'lake')).toBe(false);
    }
  });

  it('если «Ветер» не доедет, маршрут ведёт к ближайшей достижимой клетке', () => {
    const g = fresh();
    // окружаем цель болотом — уазику туда нельзя
    const tx = g.hq.x, ty = g.hq.y;
    const target = { x: Math.min(11, tx + 4), y: ty };
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = target.x + dx, y = target.y + dy;
      if (x >= 0 && x < 12 && y >= 0 && y < 12) g.map[y][x].terrain = 'marsh';
    }
    const p = findPath(g, g.hq, target, 'wind', 1);
    expect(p.reached).toBe(false);
    const last = p.cells[p.cells.length - 1];
    expect(passable(g.map[last.y][last.x].terrain, 'wind', 1)).toBe(true);
    // экипаж со штурманом проедет
    expect(findPath(g, g.hq, target, 'wind', 3).reached).toBe(true);
  });
});

describe('«Ветер» как транспорт', () => {
  it('не может быть отправлен на осмотр квадрата', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const cell = g.map.flat().find(c => c.terrain === 'forest' && c !== cellAt(g, g.hq.x, g.hq.y))!;
    expect(sendBlock(g, w, cell)).toBeTruthy();
    expect(coverRate(g, w, cell)).toBe(0);
  });

  it('везёт группу: пассажир не устаёт в дороге и едет быстрее пешего', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const foot = g.units.find(u => u.type === 'foot')!;
    // ищем открытую клетку подальше, куда уазик точно доедет
    const cell = g.map.flat()
      .filter(c => ['forest', 'meadow', 'hills'].includes(c.terrain))
      .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];
    const onFoot = planTrip(g, foot, cell, null);
    const byCar = planTrip(g, foot, cell, w);
    expect(byCar.travel).toBeLessThan(onFoot.travel);
    expect(byCar.footShare).toBeLessThan(1);

    dispatchUnit(g, foot, cell, w);
    expect(foot.mission!.carrier).toBe(w.id);
    expect(w.passengers).toContain(foot.id);
    const fatAtStart = foot.fatigue;
    runUntil(g, () => foot.status !== 'travel');
    // ехал, а не шёл: усталости почти не набрал
    expect(foot.fatigue - fatAtStart).toBeLessThan(3);
  });

  it('забирает группу с обратной дороги: та идёт пешком, машина не приезжает раньше', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const foot = g.units.find(u => u.type === 'foot')!;
    // дальняя клетка, куда и уазик доедет, и группа дойдёт пешком
    const cell = g.map.flat()
      .filter(c => targetable(c) && passable(c.terrain, 'foot', 1) && windMinutes(g, w, g.hq, c) != null)
      .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];

    dispatchUnit(g, foot, cell, null);          // ушла пешком, без машины
    foot.mission!.event = null;                 // инциденты в этом тесте не проверяем
    runUntil(g, () => foot.status === 'search');
    forceReturn(g, foot, 'recall', noop);

    expect(foot.mission!.carrier).toBe(w.id);   // машина выехала навстречу
    expect(foot.mission!.aboard).toBe(false);
    expect(w.status).toBe('travel');

    const fromCell = unitCell(g, foot);
    const fat0 = foot.fatigue;
    expect(runUntil(g, () => !!foot.mission?.aboard)).toBe(true);

    // пока «Ветер» ехал, группа шла сама: сдвинулась к штабу и подустала
    expect(unitCell(g, foot)).not.toEqual(fromCell);
    expect(foot.fatigue).toBeGreaterThan(fat0);
    // подобрали здесь и сейчас, время прибытия общее с машиной
    expect(foot.phaseStart).toBe(g.t);
    expect(foot.phaseEnd).toBe(w.phaseEnd);

    const fatAboard = foot.fatigue;
    runUntil(g, () => w.status === 'idle');
    expect(foot.status).toBe('idle');           // машина не бросила пассажира в поле
    expect(foot.fatigue).toBeLessThanOrEqual(fatAboard);   // ехала, а не шла
  });

  it('если группа дошла до лагеря сама, «Ветер» возвращается порожняком', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const foot = g.units.find(u => u.type === 'foot')!;
    const cell = g.map.flat()
      .filter(c => targetable(c) && passable(c.terrain, 'foot', 1) && windMinutes(g, w, g.hq, c) != null)
      .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];

    dispatchUnit(g, foot, cell, null);
    foot.mission!.event = null;
    runUntil(g, () => foot.status === 'search');
    forceReturn(g, foot, 'recall', noop);
    expect(w.passengers).toContain(foot.id);

    foot.phaseEnd = g.t;                        // группа успевает дойти сама
    expect(runUntil(g, () => foot.status === 'idle')).toBe(true);
    expect(runUntil(g, () => w.status === 'idle')).toBe(true);
    expect(w.passengers).toEqual([]);
    expect(w.mission).toBeNull();
  });

  it('вместимость растёт с уровнем и наследуется на ур. 3', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    w.level = 1; expect(windCapacity(w)).toBe(1);
    w.level = 2; expect(windCapacity(w)).toBe(2);
    w.level = 3; expect(windCapacity(w)).toBe(2);
  });

  it('«Ветры» не занимают слоты рации', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const foot = g.units.find(u => u.type === 'foot')!;
    const cell = g.map.flat().find(c => c.terrain === 'forest')!;
    dispatchUnit(g, foot, cell, w);
    // в поле числится одна поисковая группа, а не две единицы
    expect(g.units.filter(u => u.type !== 'wind' && u.mission).length).toBe(1);
    expect(freeWinds(g).length).toBe(0);
  });
});

describe('осмотр квадрата', () => {
  it('каждое посещение — свой полный проход: повторный визит снова даёт шансы', () => {
    const g = fresh();
    const u = g.units[0];
    const cell = g.map.flat().find(c => c.terrain === 'forest' && c.objects.length === 0)!;
    dispatchUnit(g, u, cell);
    runUntil(g, () => u.status === 'search');
    runUntil(g, () => u.mission === null || u.mission.swept >= 100);
    expect(cell.coverage).toBeGreaterThan(90);

    // второй визит стартует с нуля прохода, а покрытие клетки не откатывается
    const before = cell.coverage;
    u.status = 'idle'; u.mission = null; u.fatigue = 0;
    dispatchUnit(g, u, cell);
    expect(u.mission!.swept).toBe(0);
    expect(u.mission!.estSearch).toBeGreaterThan(10);
    runUntil(g, () => u.status === 'search');
    simMinute(g, noop);
    expect(cell.coverage).toBeGreaterThanOrEqual(before - 0.01);
  });

  it('качество зависит только от уровня, а темп — от условий', () => {
    const g = fresh();
    const u = g.units[0];
    const cell = g.map.flat().find(c => c.terrain === 'forest')!;
    const q1 = detectEff(u);
    const r1 = coverRate(g, u, cell);
    u.fatigue = 90;
    expect(detectEff(u)).toBe(q1);                     // усталость не делает внимательнее/слепее
    expect(coverRate(g, u, cell)).toBeLessThan(r1);    // но замедляет
    u.fatigue = 0;
    u.level = 4;
    expect(detectEff(u)).toBeGreaterThan(q1);
    expect(searchEst(g, u, cell)).toBeGreaterThan(0);
  });

  it('мусор приходит по уровню: новички носят много, ГСН — ничего', () => {
    const count = (level: number): number => {
      let total = 0;
      const rounds = 12;
      for (let i = 0; i < rounds; i++) {
        const g = fresh();
        g.buildings.radio = 3;                      // живая передача — улики сразу в списке
        const u = g.units[0];
        u.level = level;
        const cell = g.map.flat().find(c => c.terrain === 'forest' && c.objects.length === 0)!;
        const before = g.clues.length;
        dispatchUnit(g, u, cell);
        runUntil(g, () => u.status === 'search');
        runUntil(g, () => u.mission === null || u.mission.swept >= 100);
        total += g.clues.length - before;            // в пустой клетке всё принесённое — мусор
      }
      return total / rounds;
    };
    const novice = count(1);
    const gsn = count(4);
    expect(novice).toBeGreaterThan(2.5);
    expect(gsn).toBe(0);
    expect(count(3)).toBeLessThan(novice);
  });
});

describe('коптер', () => {
  it('не растит покрытие и не создаёт улик — только наводки', () => {
    const g = fresh();
    const d = hire(g, 'drone');
    // ставим день, чтобы камера могла лететь
    while (sendBlock(g, d, cellAt(g, g.lkp.x, g.lkp.y))) simMinute(g, noop);
    const cell = cellAt(g, g.lkp.x, g.lkp.y);
    const cov = cell.coverage, clues = g.clues.length;
    dispatchUnit(g, d, cell);
    expect(d.mission!.estSearch).toBe(RECON_MIN);
    runUntil(g, () => d.status === 'return' || d.status === 'idle');
    expect(cell.coverage).toBe(cov);                  // квадрат не обследован
    expect(g.clues.length).toBe(clues);               // улик не принёс
  });

  it('в чащу не отправляется', () => {
    const g = fresh();
    const d = hire(g, 'drone');
    const dense = g.map.flat().find(c => c.terrain === 'dense');
    if (dense) expect(sendBlock(g, d, dense)).toBeTruthy();
  });
});

describe('события и инциденты', () => {
  it('травма — редкость внутри пула, иначе отряды выбывают в каждом деле', () => {
    const g = fresh();
    const u = g.units[0];
    const pool = incidentPool(u);
    const total = Object.values(pool).reduce((s, w) => s + (w || 0), 0);
    expect((pool.injury || 0) / total).toBeLessThan(0.15);
  });

  it('событие выпадает примерно в 30% задач, инцидент — по уровню отряда', () => {
    const g = fresh();
    const u = g.units[0];
    u.level = 1;
    const N = 4000;
    let events = 0, incidents = 0;
    for (let i = 0; i < N; i++) {
      const e = rollEvent(g, u, 200);
      if (e) { events++; if (e.kind === 'incident') incidents++; }
    }
    expect(events / N).toBeGreaterThan(EVENT_CHANCE - 0.04);
    expect(events / N).toBeLessThan(EVENT_CHANCE + 0.04);
    // итоговая доля инцидентов должна совпасть с табличной для уровня
    const target = LVL.foot[0].incident;
    expect(incidents / N).toBeGreaterThan(target - 0.04);
    expect(incidents / N).toBeLessThan(target + 0.04);
  });

  it('момент события попадает внутрь задачи', () => {
    const g = fresh();
    const u = g.units[0];
    for (let i = 0; i < 300; i++) {
      const e = rollEvent(g, u, 100);
      if (!e) continue;
      expect(e.at).toBeGreaterThan(g.t);
      expect(e.at).toBeLessThanOrEqual(g.t + 100);
    }
  });
});

describe('занятость в 06:00', () => {
  it('проверку проходят все, но группа в поле сначала доводит задачу', () => {
    const g = fresh();
    const u = g.units[0];
    const cell = g.map.flat().find(c => c.terrain === 'forest')!;
    dispatchUnit(g, u, cell);
    // доводим до 06:00 (t=0 это 08:00, значит 06:00 наступит на 1320-й минуте)
    runUntil(g, () => (8 * 60 + g.t) % 1440 === 6 * 60, 1500);
    simMinute(g, noop);
    // если бросок сработал, отряд всё равно не брошен посреди задачи
    if (u.busyUntil > g.t) {
      expect(['travel', 'search', 'return', 'idle']).toContain(u.status);
      expect(isBusy(g, u)).toBe(true);
      expect(available(g, u)).toBe(false);
    }
  });
});

describe('прокачка и исходы', () => {
  it('обучение мгновенное и забирает группу из дела', () => {
    const g = fresh();
    g.funds = 5000;
    actBuild(g, 'train', noop);
    const u = g.units[0];
    expect(actTrain(g, u.id, noop).ok).toBe(true);
    expect(u.level).toBe(2);
    expect(u.away).toBe('training');
    expect(available(g, u)).toBe(false);
    // выбывшую нельзя отправить
    const cell = g.map.flat().find(c => c.terrain === 'forest')!;
    g.ui.sel = { x: cell.x, y: cell.y };
    g.ui.selUnits.clear(); g.ui.selUnits.add(u.id);
    expect(actSend(g, noop).ok).toBe(false);
  });

  it('ноль на таймере жизни НЕ заканчивает дело — уезжают медики', () => {
    const g = fresh();
    g.victim.strength = 0.0001;
    simMinute(g, noop);
    expect(g.medicsGone).toBe(true);
    expect(g.over).toBeNull();
    // и время продолжает идти
    const t0 = g.t;
    simMinute(g, noop);
    expect(g.t).toBe(t0 + 1);
  });

  it('после конца дела действия заблокированы', () => {
    const g = fresh();
    g.funds = 5000;
    actAbandon(g, noop);
    expect(g.over!.outcome).toBe('abandoned');
    expect(actBuild(g, 'carto', noop).ok).toBe(false);
    expect(actSend(g, noop).ok).toBe(false);
    expect(actTrain(g, g.units[0].id, noop).ok).toBe(false);
  });
});
