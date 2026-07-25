import type { Pt, Gender } from './types';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const cheb = (a: Pt, b: Pt): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const angleTo = (a: Pt, b: Pt): number =>
  (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI + 360) % 360;
export const angDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
export const DIRN = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
export const oct = (d: number): number => Math.round((((d % 360) + 360) % 360) / 45) % 8;
export const dirArrow = (d: number): string => ARROWS[oct(d)];
export const dirName = (d: number): string => DIRN[oct(d)];

export const COLS = 'ABCDEFGHIJKL';
export const coordName = (x: number, y: number): string => COLS[x] + (y + 1);

export const plural = (n: number, a: string, b: string, c: string): string => {
  n = Math.abs(n) % 100;
  const m = n % 10;
  if (n > 10 && n < 20) return c;
  if (m > 1 && m < 5) return b;
  if (m === 1) return a;
  return c;
};

export const fmtDur = (m: number): string =>
  m >= 60 ? Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин' : m + ' мин';

// Согласование рода: gv({gen}, женская_форма, мужская_форма)
export const gv = (u: { gen: Gender }, f: string, m: string): string => (u.gen === 'f' ? f : m);

// Игровое время: старт t=0 = 08:00 первого дня.
export function fmtTime(t: number): string {
  const abs = 8 * 60 + t;
  const day = Math.floor(abs / 1440) + 1;
  const h = Math.floor((abs % 1440) / 60), min = abs % 60;
  return `День ${day} · ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
export function fmtTimeAt(t: number): string {
  const abs = 8 * 60 + t;
  const day = Math.floor(abs / 1440) + 1;
  const h = Math.floor((abs % 1440) / 60), min = abs % 60;
  return `д${day} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
