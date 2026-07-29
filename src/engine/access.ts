import type { Game, Unit, Cell, Clue, UnitType, Pt } from './types';
import { cheb, dist, clamp } from './util';
import {
  W, H, TYPES, SMOD, NIGHT, WEATHER, RANGE, COVER_BASE, lvl, RESTM, REST_MULT,
  MISSCAP, TENTCAP, WIND_PASSENGERS,
} from './constants';
import { findPath, moverOf, passable } from './path';

export const cellAt = (g: Game, x: number, y: number): Cell => g.map[y][x];
export const clueById = (g: Game, id: number): Clue | undefined => g.clues.find(c => c.id === id);
export const unitById = (g: Game, id: number): Unit | undefined => g.units.find(u => u.id === id);
export const effMark = (c: Clue): 'real' | 'junk' | null => c.verdict || c.mark;

export const hourOf = (g: Game): number => Math.floor(((8 * 60 + g.t) % 1440) / 60);
export const isNight = (g: Game): boolean => { const h = hourOf(g); return h >= 22 || h < 6; };

/** Групп в поле. «Ветры» не считаются — лимит рации про поисковые группы, а не про машины. */
export const activeMissions = (g: Game): number =>
  g.units.filter(u => u.type !== 'wind' && u.mission && u.status !== 'idle').length;
export const inRange = (g: Game, cell: Cell): boolean => cheb(g.hq, cell) <= RANGE[g.buildings.radio];
export const targetable = (cell: Cell): boolean => cell.terrain !== 'lake' && cell.terrain !== 'base';

export const fatEff = (f: number): number => 1 - 0.6 * Math.pow(f / 100, 1.5);
export const lvlPow = (u: Unit): number => lvl(u.type, u.level).detect;
export const lvlSpd = (u: Unit): number => lvl(u.type, u.level).speed;
export const lvlFat = (u: Unit): number => lvl(u.type, u.level).fat;
export const lvlName = (u: Unit): string => lvl(u.type, u.level).name;
export const readsDir = (u: Unit): boolean => lvl(u.type, u.level).dir;
export const fatLabel = (u: Unit): string => (u.type === 'drone' ? 'заряд' : 'усталость');
export const fatShown = (u: Unit): number => (u.type === 'drone' ? Math.round(100 - u.fatigue) : Math.round(u.fatigue));

/** Отряд занят по работе (проверка в 06:00) — вернётся в 18:00. */
export const isBusy = (g: Game, u: Unit): boolean => g.t < u.busyUntil;
/** После паники нужен дополнительный отдых. */
export const needsRest = (u: Unit): boolean => u.restNeed > 0 && u.fatigue > u.restNeed;

/** Может ли отряд принять задачу прямо сейчас. */
export function available(g: Game, u: Unit): boolean {
  return !u.away && u.status === 'idle' && !isBusy(g, u) && !needsRest(u);
}

export const inCamp = (g: Game): Unit[] => g.units.filter(u => available(g, u));
/** Свободные «Ветры», готовые к рейсу. */
export const freeWinds = (g: Game): Unit[] => g.units.filter(u => u.type === 'wind' && available(g, u));
export const tentUsed = (g: Game): number => g.units.length;
export const tentFree = (g: Game): number => TENTCAP[g.buildings.tent] - g.units.length;
export const awayCount = (g: Game): number => g.units.filter(u => !!u.away).length;
export const missionSlots = (g: Game): number => MISSCAP[g.buildings.radio] - activeMissions(g);

/** Качество осмотра: зависит только от типа и уровня. Условия влияют на ТЕМП, а не на внимательность. */
export function detectEff(u: Unit): number {
  return lvl(u.type, u.level).detect;
}

/** Темп закрытия квадрата, % покрытия в минуту. */
export function coverRate(g: Game, u: Unit, cell: Cell): number {
  const L = lvl(u.type, u.level);
  if (L.cover <= 0) return 0;                       // «Ветер» и коптер квадрат не закрывают
  const mover: 'foot' | 'dog' = u.type === 'dog' ? 'dog' : 'foot';
  const terr = (SMOD[cell.terrain] && SMOD[cell.terrain][mover]) || 0;
  let r = COVER_BASE * L.cover * terr;
  r *= WEATHER[g.weather].mod[u.type];
  if (isNight(g)) r *= NIGHT[u.type];
  r *= fatEff(u.fatigue);
  return r;
}

/**
 * Прогноз минут на полный проход по квадрату. Проход всегда полный (0→100), даже если
 * квадрат уже обследован: вторая группа прочёсывает его заново и получает свежие шансы.
 */
export function searchEst(g: Game, u: Unit, cell: Cell): number {
  if (u.type === 'drone') return 0;                 // у коптера свой режим — разведка
  const r = coverRate(g, u, cell);
  if (r <= 0.01) return Infinity;
  return Math.max(1, Math.ceil(100 / r));
}

/** Совместимость с прежним UI: «эффективность» как одно число (качество × темп). */
export function searchEff(g: Game, u: Unit, cell: Cell): number {
  if (u.type === 'drone') return detectEff(u);
  return detectEff(u) * (coverRate(g, u, cell) / Math.max(0.01, lvl(u.type, u.level).cover));
}

export const restRate = (g: Game, u: Unit): number =>
  (u.type === 'drone' ? 1.4 : 0.45) * RESTM[g.buildings.rest] * REST_MULT[u.type];

// --- Поездка ---

export interface Trip {
  travel: number;          // минут до цели всего
  route: Pt[];             // клетки маршрута (для отрисовки)
  carrier: number | null;  // id «Ветра»
  footShare: number;       // доля времени, пройденная пешком (усталость только за неё)
  reached: boolean;        // добрались ли собственно до цели
  windMin: number;
  footMin: number;
  drop: Pt;                // где «Ветер» высадил группу
}

const legMin = (cost: number, cellMin: number, speed: number, fatigue: number): number => {
  let t = (cost * cellMin) / Math.max(0.1, speed);
  if (fatigue > 70) t *= 1.25;
  return Math.max(1, Math.round(t));
};

/** Планирует дорогу отряда до квадрата. `carrier` — «Ветер», если группу везут. */
export function planTrip(g: Game, u: Unit, cell: Cell, carrier: Unit | null = null): Trip {
  const T = TYPES[u.type];

  if (u.type === 'drone') {
    const t = Math.max(3, Math.round(dist(g.hq, cell) * T.cellMin * (1 / lvlSpd(u))));
    return { travel: t, route: [{ ...g.hq }, { x: cell.x, y: cell.y }], carrier: null, footShare: 0, reached: true, windMin: 0, footMin: t, drop: { x: cell.x, y: cell.y } };
  }

  if (carrier) {
    const wp = findPath(g, g.hq, cell, 'wind', carrier.level);
    const drop = wp.cells[wp.cells.length - 1];
    const windMin = legMin(wp.cost, TYPES.wind.cellMin, lvlSpd(carrier), carrier.fatigue);
    const fp = findPath(g, drop, cell, 'foot');
    const footMin = wp.reached ? 0 : legMin(fp.cost, T.cellMin, lvlSpd(u), u.fatigue);
    const travel = Math.max(1, windMin + footMin);
    const route = wp.reached ? wp.cells : wp.cells.concat(fp.cells.slice(1));
    return { travel, route, carrier: carrier.id, footShare: footMin / travel, reached: true, windMin, footMin, drop };
  }

  const fp = findPath(g, g.hq, cell, 'foot');
  const travel = legMin(fp.cost, T.cellMin, lvlSpd(u), u.fatigue);
  return { travel, route: fp.cells, carrier: null, footShare: 1, reached: fp.reached, windMin: 0, footMin: travel, drop: { x: cell.x, y: cell.y } };
}

/** Сколько минут «Ветер» уровня L доедет от `from` до `to` (для расчёта подбора). */
export function windMinutes(g: Game, wind: Unit, from: Pt, to: Pt): number | null {
  const wp = findPath(g, from, to, 'wind', wind.level);
  if (!wp.reached) return null;
  return legMin(wp.cost, TYPES.wind.cellMin, lvlSpd(wind), wind.fatigue);
}

export const windCapacity = (u: Unit): number => WIND_PASSENGERS[Math.min(4, Math.max(1, u.level))];

/** Совместимость: прежнее имя. Время пути пешком/своим ходом, без доставки. */
export function travelTime(g: Game, u: Unit, cell: Cell): number {
  return planTrip(g, u, cell).travel;
}

/** Можно ли вообще отправить этот отряд в этот квадрат (кроме проверок связи и слотов). */
export function sendBlock(g: Game, u: Unit, cell: Cell): string | null {
  if (!targetable(cell)) return 'Этот квадрат нельзя обследовать';
  if (u.type === 'wind') return '«Ветер» не обследует квадраты — он возит группы';
  if (u.type === 'drone') {
    if (cell.terrain === 'dense') return 'Под кронами чащи с воздуха ничего не видно';
    if (isNight(g) && u.level !== 2) return u.level >= 3 ? 'Вертолёт летает только днём' : 'Коптер с камерой летает только днём';
  }
  if (!passable(cell.terrain, moverOf(u.type), u.level)) return 'Туда не добраться';
  return null;
}

// Интерполированные позиции отрядов на карте (для отрисовки). Ключ "x,y" → список типов юнитов.
export function unitPositions(g: Game): Map<string, UnitType[]> {
  const pos = new Map<string, UnitType[]>();
  for (const u of g.units) {
    if (!u.mission) continue;
    const m = u.mission;
    const p = clamp((g.t - u.phaseStart) / Math.max(1, u.phaseEnd - u.phaseStart), 0, 1);
    let x: number, y: number;
    if (u.status === 'travel') {
      const r = m.route;
      if (r && r.length > 1) { const i = Math.min(r.length - 1, Math.floor(p * (r.length - 1))); x = r[i].x; y = r[i].y; }
      else { x = g.hq.x + (m.x - g.hq.x) * p; y = g.hq.y + (m.y - g.hq.y) * p; }
    } else if (u.status === 'search') { x = m.x; y = m.y; }
    else if (u.status === 'return') {
      const r = m.route;
      if (r && r.length > 1) { const i = Math.max(0, Math.min(r.length - 1, Math.round((1 - p) * (r.length - 1)))); x = r[i].x; y = r[i].y; }
      else { const s = m.retFrom || m; x = s.x + (g.hq.x - s.x) * p; y = s.y + (g.hq.y - s.y) * p; }
    } else continue;
    const k = Math.round(clamp(x, 0, W - 1)) + ',' + Math.round(clamp(y, 0, H - 1));
    const arr = pos.get(k);
    if (arr) arr.push(u.type); else pos.set(k, [u.type]);
  }
  return pos;
}
