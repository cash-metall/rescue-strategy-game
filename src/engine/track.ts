// Траектории движения отрядов по карте: геометрия пути + разметка по ВРЕМЕНИ.
//
// Рендер спрашивает позицию в произвольный дробный момент (`unitFloat(g, u, tNow)`),
// поэтому траектория обязана быть:
//   • непрерывной — новая фаза начинается там, где отряд стоит сейчас, иначе иконка
//     телепортируется, а плавная отрисовка честно «улетает» через полкарты;
//   • параметризованной временем, а не номером клетки — иначе отряд идёт по болоту
//     с той же скоростью, что по лугу, а группа с подвозом проходит пеший хвост
//     так же быстро, как ехала на машине.
import type { Game, Pt } from './types';
import { cellCost, type Mover } from './path';

/**
 * Путь одной фазы. `pts` — точки маршрута (клетки; первая может быть дробной — там,
 * где отряд развернулся посреди клетки). `ts[i]` — доля времени фазы к моменту, когда
 * отряд в `pts[i]`: `ts[0] = 0`, последняя — ровно 1.
 */
export interface Track {
  pts: Pt[];
  ts: number[];
}

const cp = (p: Pt): Pt => ({ x: p.x, y: p.y });
const same = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** Отряд стоит на месте (нет пути — например, цель совпала со штабом). */
export const pointTrack = (p: Pt): Track => ({ pts: [cp(p)], ts: [0] });

/** Прямая: полёт коптера и вообще всё, что идёт не по клеткам. */
export const lineTrack = (a: Pt, b: Pt): Track =>
  same(a, b) ? pointTrack(a) : { pts: [cp(a), cp(b)], ts: [0, 1] };

/** Приписать пути фактическую точку старта — так фаза продолжается без разрыва. */
export const withStart = (from: Pt, pts: Pt[]): Pt[] =>
  (!pts.length || same(from, pts[0])) ? pts.map(cp) : [cp(from), ...pts.map(cp)];

/** Нормировка весов сегментов в накопленные доли времени. */
function norm(pts: Pt[], w: number[]): Track {
  let total = 0;
  for (const x of w) total += x;
  const ts: number[] = [0];
  let acc = 0;
  for (const x of w) { acc += x; ts.push(total > 0 ? acc / total : 1); }
  ts[ts.length - 1] = 1;          // последняя доля строго 1, без накопленной погрешности
  return { pts, ts };
}

/**
 * Траектория по клеткам пути: время внутри распределяется по цене клеток — той же,
 * по которой Дейкстра считала дорогу. Поэтому иконка замедляется там, где отряд
 * действительно идёт медленнее, а суммарная длительность остаётся за симуляцией.
 */
export function buildTrack(g: Game, pts: Pt[], mover: Mover): Track {
  if (pts.length < 2) return pointTrack(pts[0] ?? { x: 0, y: 0 });
  const w: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);       // диагональ даёт ×√2 сама
    const c = g.map[Math.round(b.y)]?.[Math.round(b.x)];
    const cost = c ? cellCost(c.terrain, mover) : 1;
    w.push(Math.max(1e-6, len * cost));
  }
  return norm(pts.map(cp), w);
}

/**
 * Склейка плеч с заданной длительностью каждого: автомобильное плечо + пеший хвост.
 * Доли времени берутся из минут, а не из длины, поэтому на карте видно, как группа
 * выгружается из машины и дальше плетётся пешком.
 */
export function joinTracks(parts: { track: Track; minutes: number }[]): Track {
  const use = parts.filter(p => p.track.pts.length > 0 && p.minutes > 0);
  if (!use.length) return parts[0]?.track ?? pointTrack({ x: 0, y: 0 });
  if (use.length === 1) return use[0].track;
  let total = 0;
  for (const p of use) total += p.minutes;
  const pts: Pt[] = [];
  const ts: number[] = [];
  let base = 0;
  for (const part of use) {
    const share = part.minutes / total;
    const from = pts.length ? 1 : 0;      // стык плеч — одна и та же точка, не дублируем
    for (let i = from; i < part.track.pts.length; i++) {
      pts.push(cp(part.track.pts[i]));
      ts.push(base + part.track.ts[i] * share);
    }
    base += share;
  }
  ts[ts.length - 1] = 1;
  return { pts, ts };
}

/** Позиция в момент `p` — доля времени фазы, 0..1. */
export function trackPos(tr: Track, p: number): Pt {
  const n = tr.pts.length;
  if (n === 1) return cp(tr.pts[0]);
  if (p <= 0) return cp(tr.pts[0]);
  if (p >= 1) return cp(tr.pts[n - 1]);
  let i = 0;
  while (i < n - 2 && tr.ts[i + 1] <= p) i++;
  const span = tr.ts[i + 1] - tr.ts[i];
  const k = span > 1e-9 ? (p - tr.ts[i]) / span : 0;
  const a = tr.pts[i], b = tr.pts[i + 1];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Куда фаза приводит: для фазы осмотра это и есть место, где стоит отряд. */
export const trackEnd = (tr: Track): Pt => cp(tr.pts[tr.pts.length - 1]);

/**
 * Делит траекторию прогрессом `p` на пройденную часть и остаток — для линии маршрута
 * на карте. Точка разреза принадлежит обеим частям и равна `trackPos(tr, p)`, то есть
 * ровно той точке, где сейчас стоит отряд: линия не имеет дырки на стыке, а иконка
 * стоит на самом стыке. Части короче двух точек рисовать нечем — их отдаём как есть.
 */
export function trackSplit(tr: Track, p: number): { done: Pt[]; left: Pt[] } {
  const n = tr.pts.length;
  if (n < 2) return { done: [], left: [] };
  const cut = trackPos(tr, p);
  const done: Pt[] = [];
  const left: Pt[] = [];
  for (let i = 0; i < n; i++) (tr.ts[i] <= p ? done : left).push(cp(tr.pts[i]));
  if (done.length && !same(done[done.length - 1], cut)) done.push(cp(cut));
  if (left.length && !same(left[0], cut)) left.unshift(cp(cut));
  return { done, left };
}
