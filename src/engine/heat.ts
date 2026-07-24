import type { Game } from './types';
import { W, H } from './constants';
import { effMark } from './access';
import { angDiff } from './util';

// Карта вероятности 0..1 по подтверждённым/помеченным настоящими уликам + затухание вокруг ТПК.
export function heatScores(g: Game): number[][] {
  const hints = g.clues.filter(c => effMark(c) === 'real');
  const sc: number[][] = [];
  let mx = 0;
  for (let y = 0; y < H; y++) {
    sc.push([]);
    for (let x = 0; x < W; x++) {
      let s = 0.35 * Math.exp(-Math.hypot(x - g.lkp.x, y - g.lkp.y) / 3);
      for (const h of hints) {
        const dx = x - h.x, dy = y - h.y;
        const d = Math.hypot(dx, dy);
        if (h.dirShow != null) {
          if (d < 0.5) continue;
          const ang = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          const diff = angDiff(ang, h.dirShow);
          if (diff < 70) s += Math.cos(diff * Math.PI / 180) * Math.exp(-Math.abs(d - 2.5) / 3);
        } else {
          s += 0.9 * Math.exp(-d / 1.6);
        }
      }
      sc[y].push(s);
      if (s > mx) mx = s;
    }
  }
  if (mx > 0) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sc[y][x] /= mx;
  return sc;
}
