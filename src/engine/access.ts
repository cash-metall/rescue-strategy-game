import type { Game, Unit, Cell, Clue, UnitType } from './types';
import { cheb, dist, clamp } from './util';
import { W, H, TYPES, SMOD, TMOD, NIGHT, WEATHER, RANGE } from './constants';

export const cellAt = (g: Game, x: number, y: number): Cell => g.map[y][x];
export const clueById = (g: Game, id: number): Clue | undefined => g.clues.find(c => c.id === id);
export const unitById = (g: Game, id: number): Unit | undefined => g.units.find(u => u.id === id);
export const effMark = (c: Clue): 'real' | 'junk' | null => c.verdict || c.mark;

export const hourOf = (g: Game): number => Math.floor(((8 * 60 + g.t) % 1440) / 60);
export const isNight = (g: Game): boolean => { const h = hourOf(g); return h >= 22 || h < 6; };

export const activeMissions = (g: Game): number =>
  g.units.filter(u => u.mission && u.status !== 'idle').length;
export const inRange = (g: Game, cell: Cell): boolean => cheb(g.hq, cell) <= RANGE[g.buildings.radio];
export const targetable = (cell: Cell): boolean => cell.terrain !== 'lake' && cell.terrain !== 'base';

export const fatEff = (f: number): number => 1 - 0.6 * Math.pow(f / 100, 1.5);
export const lvlPow = (u: Unit): number => 1 + 0.3 * (u.level - 1);
export const lvlSpd = (u: Unit): number => 1 - 0.15 * (u.level - 1);
export const lvlFat = (u: Unit): number => 1 - 0.2 * (u.level - 1);
export const fatLabel = (u: Unit): string => (u.type === 'drone' ? 'заряд' : 'усталость');
export const fatShown = (u: Unit): number => (u.type === 'drone' ? Math.round(100 - u.fatigue) : Math.round(u.fatigue));

export function searchEff(g: Game, u: Unit, cell: Cell): number {
  const T = TYPES[u.type];
  let e = T.power * lvlPow(u);
  e *= (SMOD[cell.terrain] && SMOD[cell.terrain][u.type]) || 0;
  e *= WEATHER[g.weather].mod[u.type];
  if (isNight(g)) e *= NIGHT[u.type];
  e *= fatEff(u.fatigue);
  return e;
}

// Интерполированные позиции отрядов на карте (для отрисовки). Ключ "x,y" → список типов юнитов.
export function unitPositions(g: Game): Map<string, UnitType[]> {
  const pos = new Map<string, UnitType[]>();
  for (const u of g.units) {
    if (!u.mission) continue;
    const m = u.mission;
    const p = clamp((g.t - u.phaseStart) / Math.max(1, u.phaseEnd - u.phaseStart), 0, 1);
    let x: number, y: number;
    if (u.status === 'travel') { x = g.hq.x + (m.x - g.hq.x) * p; y = g.hq.y + (m.y - g.hq.y) * p; }
    else if (u.status === 'search') { x = m.x; y = m.y; }
    else if (u.status === 'return') { const s = m.retFrom || m; x = s.x + (g.hq.x - s.x) * p; y = s.y + (g.hq.y - s.y) * p; }
    else continue;
    const k = Math.round(clamp(x, 0, W - 1)) + ',' + Math.round(clamp(y, 0, H - 1));
    const arr = pos.get(k);
    if (arr) arr.push(u.type); else pos.set(k, [u.type]);
  }
  return pos;
}

export function travelTime(g: Game, u: Unit, cell: Cell): number {
  const T = TYPES[u.type];
  const tm = (TMOD[cell.terrain] && TMOD[cell.terrain][u.type]) || 1;
  let t = dist(g.hq, cell) * T.cellMin * tm * lvlSpd(u);
  if (u.fatigue > 70) t *= 1.25;
  return Math.max(3, Math.round(t));
}
