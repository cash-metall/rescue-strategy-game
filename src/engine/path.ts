// Поиск дешёвого пути по клеткам (Дейкстра, 8 направлений).
// Цена клетки берётся из PATHCOST — отдельно для пешего и для машины (см. docs/terrain.md).
import type { Game, Pt, Terrain, UnitType } from './types';
import { W, H, PATHCOST, WIND_PASS } from './constants';

export type Mover = 'foot' | 'wind';

export const moverOf = (type: UnitType): Mover => (type === 'wind' ? 'wind' : 'foot');

const DIAG = Math.SQRT2;
const STEPS: Array<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, DIAG], [1, -1, DIAG], [-1, 1, DIAG], [-1, -1, DIAG],
];

/** Проходима ли клетка для этого «движителя». Озеро непроходимо всегда и для всех. */
export function passable(terrain: Terrain, mover: Mover, level: number): boolean {
  if (terrain === 'lake') return false;
  if (mover === 'wind') return (WIND_PASS[Math.min(4, Math.max(1, level))] || []).includes(terrain);
  return true;
}

export const cellCost = (terrain: Terrain, mover: Mover): number => PATHCOST[mover][terrain] ?? 1;

export interface PathResult {
  /** Сумма цен клеток вдоль пути (без стартовой) — умножается на cellMin и lvlSpd. */
  cost: number;
  /** Клетки пути, включая старт и финиш. */
  cells: Pt[];
  /** Достигнута ли запрошенная цель (false — путь ведёт к ближайшей достижимой клетке). */
  reached: boolean;
}

interface Node { cost: number; maxCell: number; steps: number; prev: number }

/**
 * Дейкстра от `from`. Если `to` недостижима, возвращает путь к достижимой клетке,
 * ближайшей к `to` (это и есть «довезти максимально близко»).
 * Ничьи разрешаются в пользу маршрута с меньшей самой тяжёлой клеткой, затем — с меньшим числом шагов:
 * иначе на однородной карте маршрут дёргался бы между эквивалентными вариантами.
 */
export function findPath(g: Game, from: Pt, to: Pt, mover: Mover, level = 1): PathResult {
  const idx = (x: number, y: number) => y * W + x;
  const N = W * H;
  const nodes: (Node | null)[] = new Array(N).fill(null);
  const done = new Uint8Array(N);
  const start = idx(from.x, from.y);
  nodes[start] = { cost: 0, maxCell: 0, steps: 0, prev: -1 };

  const better = (a: Node, b: Node | null): boolean => {
    if (!b) return true;
    if (a.cost !== b.cost) return a.cost < b.cost - 1e-9;
    if (a.maxCell !== b.maxCell) return a.maxCell < b.maxCell;
    return a.steps < b.steps;
  };

  for (;;) {
    // Разреженная выборка минимума: карта 12×12, куча тут не нужна.
    let cur = -1, curNode: Node | null = null;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      if (!n || done[i]) continue;
      if (!curNode || better(n, curNode)) { cur = i; curNode = n; }
    }
    if (cur < 0 || !curNode) break;
    done[cur] = 1;
    if (cur === idx(to.x, to.y)) break;

    const cx = cur % W, cy = (cur - (cur % W)) / W;
    for (const [dx, dy, len] of STEPS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const terr = g.map[ny][nx].terrain;
      if (!passable(terr, mover, level)) continue;
      // Диагональ «сквозь угол» между двумя непроходимыми клетками не разрешаем.
      if (dx !== 0 && dy !== 0) {
        const a = g.map[cy][cx + dx].terrain, b = g.map[cy + dy][cx].terrain;
        if (!passable(a, mover, level) && !passable(b, mover, level)) continue;
      }
      const step = cellCost(terr, mover) * len;
      const cand: Node = {
        cost: curNode.cost + step,
        maxCell: Math.max(curNode.maxCell, cellCost(terr, mover)),
        steps: curNode.steps + 1,
        prev: cur,
      };
      const ni = idx(nx, ny);
      if (!done[ni] && better(cand, nodes[ni])) nodes[ni] = cand;
    }
  }

  // Цель или ближайшая к ней достижимая клетка.
  let goal = idx(to.x, to.y);
  if (!nodes[goal]) {
    let best = -1, bestD = Infinity, bestCost = Infinity;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      if (!n) continue;
      const x = i % W, y = (i - (i % W)) / W;
      const d = Math.hypot(x - to.x, y - to.y);
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && n.cost < bestCost)) {
        best = i; bestD = d; bestCost = n.cost;
      }
    }
    goal = best;
  }
  if (goal < 0 || !nodes[goal]) return { cost: 0, cells: [{ ...from }], reached: false };

  const cells: Pt[] = [];
  for (let i: number = goal; i >= 0; i = nodes[i]!.prev) cells.push({ x: i % W, y: (i - (i % W)) / W });
  cells.reverse();
  return { cost: nodes[goal]!.cost, cells, reached: goal === idx(to.x, to.y) };
}
