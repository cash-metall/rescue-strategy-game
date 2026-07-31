// Непрерывность движения отрядов.
//
// Раньше плавность жила в CSS-переходе, и проверить её можно было только глазами: движок
// отдавал позицию раз в минуту, а браузер дотягивал её анимацией — включая любой РАЗРЫВ,
// который он честно проигрывал как полёт иконки через полкарты. Теперь позиция — чистая
// функция времени (`unitFloat(g, u, tNow)`), и «иконка не должна телепортироваться»
// стало утверждением о движке, которое проверяется в node.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  newGame, simMinute, dispatchUnit, addUnit, forceReturn, unitFloat, unitFloatPositions,
  planTrip, cellAt, coverRate, targetable, available, freeWinds, windMinutes, passable,
  trackPos, trackEnd, joinTracks, lineTrack,
  setRng, resetRng, DEFAULT_CAMPAIGN, W, H,
  type Game, type Fx, type Unit, type UnitType, type Pt, type MissionEvent,
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

beforeAll(() => setRng(mulberry32(19910704)));
afterAll(() => resetRng());

const fresh = (): Game => newGame(DEFAULT_CAMPAIGN());
const hire = (g: Game, type: UnitType): Unit => { addUnit(g, type); return g.units[g.units.length - 1]; };
const d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const at = (g: Game, u: Unit, t: number): Pt => unitFloat(g, u, t)!;

function runUntil(g: Game, pred: () => boolean, limit = 5000): boolean {
  for (let i = 0; i < limit; i++) { if (pred()) return true; simMinute(g, noop); }
  return pred();
}

/** Дальний квадрат, куда доберётся пеший. */
function farCell(g: Game) {
  return g.map.flat()
    .filter(c => targetable(c) && passable(c.terrain, 'foot', 1))
    .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];
}

describe('траектория (engine/track.ts)', () => {
  it('время внутри склейки делится по минутам плеч, а не по длине', () => {
    // Плечо машины — 9 клеток за 10 минут, пеший хвост — 1 клетка за 90.
    // На отметке 10% времени группа обязана быть уже в точке высадки.
    const car = lineTrack({ x: 0, y: 0 }, { x: 9, y: 0 });
    const foot = lineTrack({ x: 9, y: 0 }, { x: 10, y: 0 });
    const tr = joinTracks([{ track: car, minutes: 10 }, { track: foot, minutes: 90 }]);
    expect(trackPos(tr, 0.1).x).toBeCloseTo(9, 6);
    expect(trackPos(tr, 0.55).x).toBeCloseTo(9.5, 6);
    expect(trackEnd(tr).x).toBe(10);
    // и монотонность: время идёт только вперёд
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const x = trackPos(tr, Math.min(1, p)).x;
      expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = x;
    }
  });
});

describe('иконки отрядов', () => {
  it('разброс внутри клетки не зависит от соседей', () => {
    // Смещение — функция только от id отряда. Иначе состав клетки менялся бы на каждой
    // границе, и на выезде из квадрата дёргался бы и сам отряд, и все, кто там стоит.
    const g = fresh();
    const a = g.units[0];
    const b = hire(g, 'foot');
    const cell = farCell(g);
    dispatchUnit(g, a, cell);
    const alone = unitFloatPositions(g).find(p => p.id === a.id)!;

    dispatchUnit(g, b, cell);                       // второй отряд в ту же клетку
    const together = unitFloatPositions(g).find(p => p.id === a.id)!;
    expect(together.x).toBe(alone.x);
    expect(together.y).toBe(alone.y);

    // и друг на друге они всё-таки не сидят
    const other = unitFloatPositions(g).find(p => p.id === b.id)!;
    expect(d(together, other)).toBeGreaterThan(0.1);
  });
});

describe('змейка покрытия', () => {
  it('покрытие растёт ровно на coverRate за минуту — этим же темпом рендер доводит змейку', () => {
    // MapGrid интерполирует прогресс прохода внутри минуты как `swept + coverRate × frac`.
    // Если движок начнёт добавлять покрытие как-то иначе, змейка снова разъедется с группой.
    const g = fresh();
    const u = g.units[0];
    const cell = g.map.flat().find(c => c.terrain === 'forest' && !c.objects.length
      && !(g.victim.x === c.x && g.victim.y === c.y))!;
    dispatchUnit(g, u, cell);
    u.mission!.event = null;
    runUntil(g, () => u.status === 'search');

    const rate = coverRate(g, u, cell);          // темп ДО шага: усталость растёт уже после
    const before = u.mission!.swept;
    simMinute(g, noop);
    expect(u.mission!.swept - before).toBeCloseTo(rate, 6);
    expect(rate).toBeGreaterThan(0);
  });

  it('осмотр кончается по проходу, а не по прогнозу estSearch', () => {
    // Змейка и подпись в карточке считаются от `swept`, поэтому обязаны догорать ровно к
    // концу осмотра. Прогноз `estSearch` — величина момента отправки, и она заведомо
    // оптимистична: усталость по ходу прохода режет темп.
    const g = fresh();
    const u = g.units[0];
    const cell = g.map.flat().find(c => c.terrain === 'forest' && !c.objects.length
      && !(g.victim.x === c.x && g.victim.y === c.y))!;
    dispatchUnit(g, u, cell);
    u.mission!.event = null;
    runUntil(g, () => u.status === 'search');
    const est = u.mission!.estSearch;
    const start = g.t;
    runUntil(g, () => u.status !== 'search', 5000);
    const spent = g.t - start;
    // прогноз не совпал с фактом — и это норма, поэтому таймер фазы для подписи не годится
    expect(spent).toBeGreaterThan(est);
  });
});

describe('непрерывность при смене фазы', () => {
  it('разворот с маршрута продолжается из точки разворота, а не от цели', () => {
    const g = fresh();
    const u = g.units[0];
    dispatchUnit(g, u, farCell(g));
    u.mission!.event = null;
    for (let i = 0; i < 5; i++) simMinute(g, noop);
    expect(u.status).toBe('travel');

    const before = at(g, u, g.t);
    forceReturn(g, u, 'recall', noop);
    expect(u.status).toBe('return');
    expect(d(at(g, u, g.t), before)).toBeLessThan(0.01);
    // и назад она идёт К ШТАБУ, а не куда-нибудь ещё
    expect(d(trackEnd(u.mission!.track), g.hq)).toBeLessThan(0.01);
  });

  it('возврат с осмотра начинается в обследованном квадрате', () => {
    const g = fresh();
    const u = g.units[0];
    const cell = farCell(g);
    dispatchUnit(g, u, cell);
    u.mission!.event = null;
    runUntil(g, () => u.status === 'search');
    const before = at(g, u, g.t);
    expect(d(before, cell)).toBeLessThan(0.01);
    forceReturn(g, u, 'recall', noop);
    expect(d(at(g, u, g.t), before)).toBeLessThan(0.01);
  });

  it('собака уводит группу из её квадрата, а не из штаба', () => {
    const g = fresh();
    const dog = hire(g, 'dog');
    dog.level = 3;
    // квадрат, у которого есть проходимый сосед сверху (туда уведёт направление 0°)
    const cell = g.map.flat()
      .filter(c => targetable(c) && passable(c.terrain, 'foot', 1) && c.y >= 2
                && targetable(cellAt(g, c.x, c.y - 1)) && !(g.victim.x === c.x && g.victim.y === c.y))
      .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];
    dispatchUnit(g, dog, cell);
    dog.mission!.event = null;
    runUntil(g, () => dog.status === 'search');

    const before = at(g, dog, g.t);
    dog.mission!.hopDir = 0;          // «след ведёт на север»
    dog.mission!.swept = 100;         // проход закончен — на следующем шаге будет хоп
    simMinute(g, noop);
    if (!dog.mission || dog.mission.hops < 1) return;   // дело успело кончиться — проверять нечего
    expect(dog.mission.y).toBe(cell.y - 1);
    expect(d(at(g, dog, g.t), before)).toBeLessThan(0.01);
  });

  it('«Ветер» доезжает до точки высадки и не проскакивает дальше', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const u = g.units.find(x => x.type === 'foot')!;
    // окружаем цель болотом: уазику туда нельзя, значит высадка будет не в целевой клетке
    const cell = cellAt(g, Math.min(W - 2, g.hq.x + 4), Math.min(H - 2, g.hq.y));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cell.x + dx, y = cell.y + dy;
      if (x >= 0 && x < W && y >= 0 && y < H) g.map[y][x].terrain = 'marsh';
    }
    const trip = planTrip(g, u, cell, w);
    if (trip.footMin <= 0) return;                    // карта попалась такая, что доехать можно

    dispatchUnit(g, u, cell, w);
    const drop = trip.drop;
    // траектория машины кончается на высадке — раньше ей отдавали весь маршрут группы,
    // и она проезжала мимо, до самой цели
    expect(d(trackEnd(w.mission!.track), drop)).toBeLessThan(0.01);
    // а группа в момент высадки находится ровно там же
    expect(d(trackPos(u.mission!.track, trip.windMin / trip.travel), drop)).toBeLessThan(0.35);
    // дальше — пешком, до цели
    expect(d(trackEnd(u.mission!.track), cell)).toBeLessThan(0.01);
  });

  it('подобранная группа и машина продолжают путь от своих точек', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const u = g.units.find(x => x.type === 'foot')!;
    const cell = g.map.flat()
      .filter(c => targetable(c) && passable(c.terrain, 'foot', 1) && windMinutes(g, w, g.hq, c) != null)
      .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];

    dispatchUnit(g, u, cell, null);                   // ушла пешком
    u.mission!.event = null;
    runUntil(g, () => u.status === 'search');
    forceReturn(g, u, 'recall', noop);
    if (u.mission!.carrier == null) return;           // машина не поехала — проверять нечего

    // ждём подбора, следя за обеими иконками
    let uPos = at(g, u, g.t), wPos = at(g, w, g.t);
    for (let i = 0; i < 2000 && !u.mission?.aboard; i++) {
      simMinute(g, noop);
      if (!u.mission) break;
      const un = at(g, u, g.t), wn = at(g, w, g.t);
      expect(d(un, uPos)).toBeLessThan(1);            // ни один шаг не превращается в прыжок
      expect(d(wn, wPos)).toBeLessThan(1);
      uPos = un; wPos = wn;
    }
    expect(u.mission?.aboard).toBe(true);
    expect(u.phaseEnd).toBe(w.phaseEnd);              // приезжают вместе
  });

  it('вынужденная остановка держит машину на месте и удлиняет дорогу', () => {
    const g = fresh();
    const w = hire(g, 'wind');
    const u = g.units.find(x => x.type === 'foot')!;
    const cell = g.map.flat()
      .filter(c => targetable(c) && windMinutes(g, w, g.hq, c) != null)
      .sort((a, b) => Math.hypot(b.x - g.hq.x, b.y - g.hq.y) - Math.hypot(a.x - g.hq.x, a.y - g.hq.y))[0];
    dispatchUnit(g, u, cell, w);
    if (w.status !== 'travel') return;

    const flat: MissionEvent = { kind: 'incident', key: 'flatTire', at: g.t + 1, text: 'колесо', applied: false };
    w.mission!.event = flat;
    const endW = w.phaseEnd, endU = u.phaseEnd;
    simMinute(g, noop);
    expect(w.mission!.pausedUntil).toBeGreaterThan(g.t);
    expect(w.phaseEnd).toBeGreaterThan(endW);
    expect(u.phaseEnd).toBeGreaterThan(endU);         // пассажир ждёт вместе с машиной

    const stopped = at(g, w, g.t);
    while (g.t < w.mission!.pausedUntil - 1) {
      simMinute(g, noop);
      expect(d(at(g, w, g.t + 0.5), stopped)).toBeLessThan(1e-6);
      expect(d(at(g, u, g.t + 0.5), stopped)).toBeLessThan(0.5);   // сидит в той же машине
    }
  });
});

describe('полный прогон: ни одного телепорта', () => {
  it('позиции отрядов непрерывны по времени на всём деле', () => {
    // Прогон с покадровой выборкой: раз в четверть минуты сверяем позицию с предыдущей.
    // Любой разрыв (устаревшая траектория, разворот «от цели», сшивание пассажиров в одну
    // точку, перещёлкивание разброса) — это прыжок на клетки, и он сюда не пролезет.
    const SAMPLES = [0, 0.25, 0.5, 0.75];
    const STEP_MAX = 0.5;         // клеток за четверть минуты; быстрее не двигается никто
    const g = fresh();
    g.buildings.radio = 3;
    for (const t of ['foot', 'dog', 'drone', 'wind'] as UnitType[]) hire(g, t);

    const prev = new Map<number, Pt>();
    let worst = 0, worstWho = '';
    let checks = 0;

    for (let minute = 0; minute < 1500 && !g.over && !g.quest; minute++) {
      // раздаём задачи как игрок: свободных — в случайный доступный квадрат
      for (const u of g.units) {
        if (u.type === 'wind' || !available(g, u) || u.fatigue > 40) continue;
        const cells = g.map.flat().filter(c => targetable(c) && Math.hypot(c.x - g.hq.x, c.y - g.hq.y) > 1);
        const cell = cells[(minute * 7 + u.id * 13) % cells.length];
        if (u.type === 'drone' && cell.terrain === 'dense') continue;
        const wind = freeWinds(g)[0] ?? null;
        dispatchUnit(g, u, cell, u.type === 'foot' || u.type === 'dog' ? wind : null);
      }
      simMinute(g, noop);

      for (const s of SAMPLES) {
        const tNow = g.t + s;
        const seen = new Set<number>();
        for (const u of g.units) {
          const p = unitFloat(g, u, tNow);
          if (!p) continue;
          seen.add(u.id);
          const was = prev.get(u.id);
          if (was) {
            const step = d(p, was);
            checks++;
            if (step > worst) { worst = step; worstWho = `${u.name} (${u.status})`; }
            expect(step, `${u.name} прыгнул на ${step.toFixed(2)} клетки, статус ${u.status}`)
              .toBeLessThan(STEP_MAX);
          }
          prev.set(u.id, p);
        }
        for (const id of [...prev.keys()]) if (!seen.has(id)) prev.delete(id);
      }
    }

    // прогон должен быть содержательным, а не «все просидели в лагере»
    expect(checks).toBeGreaterThan(2000);
    expect(worst, `худший шаг: ${worst.toFixed(3)} у ${worstWho}`).toBeLessThan(STEP_MAX);
  }, 60000);
});
