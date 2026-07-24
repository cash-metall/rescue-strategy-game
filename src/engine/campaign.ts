import type { Campaign, Game, KV, UnitType, BuildKey } from './types';
import { SAVE_KEY, TYPES } from './constants';
import { clamp } from './util';

export function DEFAULT_CAMPAIGN(): Campaign {
  return {
    buildings: { tent: 1, radio: 0, carto: 0, rest: 0, train: 0 },
    roster: [
      { type: 'foot', name: 'Лиса-1', level: 1 },
      { type: 'foot', name: 'Лиса-2', level: 1 },
    ],
    nameCnt: { foot: 2, dog: 0, atv: 0, drone: 0 },
    stats: { won: 0, lost: 0 },
  };
}

export function normalizeCampaign(c: any): Campaign {
  const d = DEFAULT_CAMPAIGN();
  return {
    buildings: Object.assign({}, d.buildings, c?.buildings) as Record<BuildKey, number>,
    roster: (Array.isArray(c?.roster) ? c.roster : [])
      .filter((r: any) => r && (TYPES as Record<string, unknown>)[r.type])
      .map((r: any) => ({ type: r.type as UnitType, name: String(r.name || 'Отряд'), level: clamp(Number(r.level) | 0, 1, 3) })),
    nameCnt: Object.assign({}, d.nameCnt, c?.nameCnt) as Record<UnitType, number>,
    stats: Object.assign({}, d.stats, c?.stats) as { won: number; lost: number },
  };
}

export function loadCampaign(kv: KV): Campaign {
  try {
    const raw = kv.getItem(SAVE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.buildings) { const n = normalizeCampaign(c); if (n.roster.length) return n; }
    }
  } catch { /* хранилище недоступно / битые данные */ }
  return DEFAULT_CAMPAIGN();
}

// Собирает кампанию из текущего состояния g + переданной статистики и пишет в хранилище.
export function saveCampaign(kv: KV, g: Game, stats: { won: number; lost: number }): Campaign {
  const campaign: Campaign = {
    buildings: { ...g.buildings },
    roster: g.units.map(u => ({ type: u.type, name: u.name, level: u.level })),
    nameCnt: { ...g.nameCnt },
    stats: { ...stats },
  };
  try { kv.setItem(SAVE_KEY, JSON.stringify(campaign)); } catch { /* ignore */ }
  return campaign;
}

export function resetCampaign(kv: KV): Campaign {
  try { kv.removeItem(SAVE_KEY); } catch { /* ignore */ }
  return DEFAULT_CAMPAIGN();
}

// Хранилище в памяти — для тестов и как фолбэк, если localStorage недоступен.
export function memoryKV(): KV {
  const store: Record<string, string> = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}
