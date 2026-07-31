import type { Game, Unit, Cell, Clue, UnitType, Pt, Mission } from './types';
import { cheb, dist, clamp } from './util';
import {
  W, H, TYPES, SMOD, NIGHT, WEATHER, RANGE, COVER_BASE, lvl, RESTM, REST_MULT,
  MISSCAP, TENTCAP, WIND_PASSENGERS,
} from './constants';
import { findPath, moverOf, passable } from './path';
import {
  type Track, buildTrack, joinTracks, lineTrack, trackEnd, trackPos, trackSplit, withStart,
} from './track';

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
  track: Track;            // траектория ОТРЯДА: плечо машины + пеший хвост, время по плечам
  windTrack: Track | null; // траектория «Ветра»: только его плечо, до точки высадки
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
    // Коптер летит напрямую, местность ему не помеха — прямая, а не путь по клеткам.
    return {
      travel: t, track: lineTrack(g.hq, cell), windTrack: null, carrier: null, footShare: 0,
      reached: true, windMin: 0, footMin: t, drop: { x: cell.x, y: cell.y },
    };
  }

  if (carrier) {
    const wp = findPath(g, g.hq, cell, 'wind', carrier.level);
    const drop = wp.cells[wp.cells.length - 1];
    const windMin = legMin(wp.cost, TYPES.wind.cellMin, lvlSpd(carrier), carrier.fatigue);
    const fp = findPath(g, drop, cell, 'foot');
    const footMin = wp.reached ? 0 : legMin(fp.cost, T.cellMin, lvlSpd(u), u.fatigue);
    const travel = Math.max(1, windMin + footMin);
    // Время делится по плечам: пока едут — быстро, пеший хвост — медленно.
    const windTrack = buildTrack(g, wp.cells, 'wind');
    const track = wp.reached ? windTrack : joinTracks([
      { track: windTrack, minutes: windMin },
      { track: buildTrack(g, fp.cells, 'foot'), minutes: footMin },
    ]);
    return { travel, track, windTrack, carrier: carrier.id, footShare: footMin / travel, reached: true, windMin, footMin, drop };
  }

  const fp = findPath(g, g.hq, cell, 'foot');
  const travel = legMin(fp.cost, T.cellMin, lvlSpd(u), u.fatigue);
  return {
    travel, track: buildTrack(g, fp.cells, 'foot'), windTrack: null, carrier: null, footShare: 1,
    reached: fp.reached, windMin: 0, footMin: travel, drop: { x: cell.x, y: cell.y },
  };
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

/**
 * Доля пройденной фазы к моменту `tNow` (игровые минуты, можно дробные).
 * Единственная формула прогресса в игре: по ней и рисуется позиция, и считается
 * точка разворота в `forceReturn` — разъехаться им нельзя, иначе иконка прыгнет.
 *
 * Вынужденная остановка («Ветер» пробил колесо) из прогресса вычитается: её минуты
 * добавлены к `phaseEnd`, и всё это время отряд стоит на месте.
 */
export function phaseProgress(u: Unit, tNow: number): number {
  const m: Mission | null = u.mission;
  const stop = m && m.pauseFrom > 0 ? Math.max(0, m.pausedUntil - m.pauseFrom) : 0;
  const held = stop > 0 ? clamp(tNow - m!.pauseFrom, 0, stop) : 0;
  const span = Math.max(1, u.phaseEnd - u.phaseStart - stop);
  return clamp((tNow - u.phaseStart - held) / span, 0, 1);
}

/**
 * Где отряд находится в момент `tNow` — дробные координаты клетки; null — он не в поле.
 * `tNow` может опережать `g.t` меньше чем на минуту (рендер зовёт каждый кадр).
 */
export function unitFloat(g: Game, u: Unit, tNow: number = g.t): Pt | null {
  const m = u.mission;
  if (!m) return null;
  // Осмотр: отряд стоит там, куда его привела траектория. Это и есть квадрат задачи,
  // а если до цели было не добраться — ближайшая клетка, куда реально дошли.
  if (u.status === 'search') return trackEnd(m.track);
  if (u.status === 'travel' || u.status === 'return') return trackPos(m.track, phaseProgress(u, tNow));
  return null;
}

/** Клетка, в которой отряд находится сейчас — для подбора «Ветром» по дороге. */
export function unitCell(g: Game, u: Unit): Pt {
  const f = unitFloat(g, u) || u.mission || g.hq;
  return {
    x: Math.round(clamp(f.x, 0, W - 1)),
    y: Math.round(clamp(f.y, 0, H - 1)),
  };
}

/** Траектория «отсюда в лагерь». Начинается ровно в текущей точке отряда: разворот
 *  с маршрута, хоп собаки и подбор машиной меняют фазу на ходу, и любой другой старт
 *  означал бы телепорт иконки. */
export function homeTrack(g: Game, u: Unit): Track {
  const from = unitFloat(g, u) ?? { ...g.hq };
  if (u.type === 'drone') return lineTrack(from, g.hq);      // коптер летит напрямую
  const mover = moverOf(u.type);
  const pts = withStart(from, findPath(g, unitCell(g, u), g.hq, mover, u.level).cells);
  return buildTrack(g, pts, mover);
}

export interface UnitFloat { id: number; type: UnitType; x: number; y: number; }

const FAN_R  = 0.22;          // радиус разброса иконок внутри клетки, в долях клетки
const GOLDEN = 2.39996323;    // золотой угол: соседние id расходятся по разным сторонам

/**
 * Постоянное смещение отряда внутри клетки — функция ТОЛЬКО от его номера.
 * Зависеть от соседей по клетке нельзя: у движущегося отряда состав клетки меняется
 * на каждой границе, и смещение (а с ним и иконки всех соседей) прыгало бы туда-сюда.
 *
 * Тем же смещением сдвигается и линия маршрута (`unitRoutes`) — поэтому иконка едет
 * ровно по своей линии, а два отряда на одной дороге дают две параллельные.
 */
export const fanOffset = (id: number): Pt => ({
  x: Math.cos(id * GOLDEN) * FAN_R,
  y: Math.sin(id * GOLDEN) * FAN_R,
});

/** Позиция с учётом веера, зажатая в карту. Одна формула для иконки и для линии. */
const fanned = (p: Pt, off: Pt): Pt => ({
  x: clamp(p.x + off.x, 0, W - 1),
  y: clamp(p.y + off.y, 0, H - 1),
});

/** Дробные координаты всех отрядов в поле на момент `tNow` — рендер рисует прямо по ним. */
export function unitFloatPositions(g: Game, tNow: number = g.t): UnitFloat[] {
  const result: UnitFloat[] = [];
  for (const u of g.units) {
    const f = unitFloat(g, u, tNow);
    if (!f) continue;
    const p = fanned(f, fanOffset(u.id));
    result.push({ id: u.id, type: u.type, x: p.x, y: p.y });
  }
  return result;
}

export interface UnitRoute {
  id: number;
  type: UnitType;
  status: 'travel' | 'return';
  done: Pt[];              // пройденная часть пути
  left: Pt[];              // остаток до цели; последняя точка — куда идёт
}

/**
 * Маршруты отрядов, которые прямо сейчас в дороге, — по ним рендер рисует линию пути.
 * Координаты дробные, в клетках, веер уже применён (см. `fanOffset`).
 *
 * Фаза осмотра линии не даёт: отряд уже стоит в квадрате, и там про него говорят и иконка,
 * и змейка покрытия. После конца дела линий нет вовсе — не мешать раскрытию следа пропавшего.
 */
export function unitRoutes(g: Game, tNow: number = g.t): UnitRoute[] {
  if (g.over) return [];
  const out: UnitRoute[] = [];
  for (const u of g.units) {
    const m = u.mission;
    if (!m) continue;
    if (u.status !== 'travel' && u.status !== 'return') continue;
    const cut = trackSplit(m.track, phaseProgress(u, tNow));
    if (cut.done.length < 2 && cut.left.length < 2) continue;   // рисовать нечего
    const off = fanOffset(u.id);
    out.push({
      id: u.id, type: u.type, status: u.status,
      done: cut.done.map(p => fanned(p, off)),
      left: cut.left.map(p => fanned(p, off)),
    });
  }
  return out;
}
