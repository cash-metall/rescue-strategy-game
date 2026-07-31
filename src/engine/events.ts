// События и инциденты на задаче (docs/incidents.md).
// Один бросок на задачу: 30% — что что-то произойдёт; внутри этих 30% доля инцидентов подобрана так,
// чтобы ИТОГОВАЯ вероятность инцидента равнялась табличной для уровня отряда.
import type { Game, Unit, MissionEvent, IncidentKey, Sink } from './types';
import {
  EVENT_CHANCE, INCIDENTS, WIND_L3_EXTRA, INCIDENT_NAME, STORIES, lvl,
  FLAT_TIRE_STOP, REPAIR_FINE, LAMP_INJURY, PANIC_REST, LAMP_NIGHT_SPEED,
} from './constants';
import { rnd, ri, pick } from './rng';
import { gv, coordName } from './util';
import { isNight, unitById } from './access';

/** Какие инциденты доступны этому отряду и с какими весами. */
export function incidentPool(u: Unit): Partial<Record<IncidentKey, number>> {
  const base = INCIDENTS[u.type];
  if (u.type === 'wind' && u.level >= 3) return { ...base, ...WIND_L3_EXTRA };
  return base;
}

function pickWeighted(pool: Partial<Record<IncidentKey, number>>): IncidentKey | null {
  const keys = Object.keys(pool) as IncidentKey[];
  let total = 0;
  for (const k of keys) total += pool[k] || 0;
  if (total <= 0) return null;
  let r = rnd() * total;
  for (const k of keys) { r -= pool[k] || 0; if (r <= 0) return k; }
  return keys[keys.length - 1];
}

/**
 * Бросок при отправке. `totalEst` — ожидаемая длительность задачи в минутах:
 * момент события выбирается случайно внутри неё.
 */
export function rollEvent(g: Game, u: Unit, totalEst: number): MissionEvent | null {
  if (rnd() >= EVENT_CHANCE) return null;
  const p = lvl(u.type, u.level).incident;
  const span = Math.max(2, Math.round(totalEst));
  const at = g.t + ri(1, span);

  if (rnd() < p / EVENT_CHANCE) {
    const key = pickWeighted(incidentPool(u));
    if (key) return { kind: 'incident', key, at, text: INCIDENT_NAME[key], applied: false };
  }

  const opts = STORIES.filter(s => !s.only || s.only === u.type);
  const s = pick(opts);
  return { kind: 'story', key: null, at, text: s.text, applied: false };
}

/** Что делать с отрядом после инцидента: движок вызывает forceReturn через колбэк. */
export type Bail = (u: Unit, reason: 'injury' | 'panic' | 'radioDead') => void;

/**
 * Применяет событие. Возвращает true, если отряд снят с задачи.
 * `log` — pushLog из sim.ts (передаётся, чтобы не заводить circular import).
 */
export function applyEvent(
  g: Game, u: Unit, emit: Sink,
  log: (g: Game, txt: string, cls?: string) => void,
  bail: Bail,
): boolean {
  const m = u.mission;
  if (!m || !m.event || m.event.applied) return false;
  const ev = m.event;
  ev.applied = true;
  const at = coordName(m.x, m.y);

  if (ev.kind === 'story') {
    log(g, `📻 ${u.name}: ${ev.text} (кв. ${at})`);
    return false;
  }

  switch (ev.key as IncidentKey) {
    case 'injury': {
      log(g, `🚑 ${u.name}: травма в кв. ${at}. Группа снимается с поиска и выбывает до конца дела.`, 'bad');
      emit({ kind: 'toast', text: `🚑 ${u.name}: травма — группа выбыла`, tone: 'bad' });
      bail(u, 'injury');
      return true;
    }
    case 'panic': {
      log(g, `🐻 ${u.name}: встреча с диким животным, ${gv(u, 'бросает', 'бросает')} задачу и возвращается. Нужен отдых.`, 'warn');
      emit({ kind: 'toast', text: `🐻 ${u.name} возвращается: нужен отдых`, tone: 'bad' });
      u.restNeed = PANIC_REST;
      bail(u, 'panic');
      return true;
    }
    case 'gpsDead': {
      m.gps = false;
      log(g, `🛰️ ${u.name}: сели батарейки в навигаторе. Трек потерян — кв. ${at} останется незакрашенным, находки придут без привязки к карте.`, 'warn');
      emit({ kind: 'toast', text: `🛰️ ${u.name}: навигатор сел, трек потерян`, tone: 'bad' });
      return false;
    }
    case 'radioDead': {
      m.radio = false;
      log(g, `📵 ${u.name}: отказала рация. Вызвать «Ветер» не может — ${gv(u, 'идёт', 'идёт')} в штаб пешком.`, 'warn');
      emit({ kind: 'toast', text: `📵 ${u.name}: нет связи, возвращается пешком`, tone: 'bad' });
      bail(u, 'radioDead');
      return true;
    }
    case 'lampDead': {
      if (isNight(g)) {
        m.lampOut = true;
        log(g, `🔦 ${u.name}: сел фонарь, в темноте темп упал.`, 'warn');
        if (rnd() < LAMP_INJURY) {
          log(g, `🚑 ${u.name}: в темноте без фонаря — травма. Группа выбывает до конца дела.`, 'bad');
          emit({ kind: 'toast', text: `🚑 ${u.name}: травма в темноте`, tone: 'bad' });
          bail(u, 'injury');
          return true;
        }
        emit({ kind: 'toast', text: `🔦 ${u.name}: сел фонарь`, tone: 'bad' });
      } else {
        log(g, `🔦 ${u.name}: сел фонарь, но днём это не помеха.`);
      }
      return false;
    }
    case 'flatTire': {
      const stop = ri(FLAT_TIRE_STOP[0], FLAT_TIRE_STOP[1]);
      // Стоянка удлиняет фазу, а не «съедает» дорогу: иначе колесо, пробитое в начале
      // длинного рейса, не стоило вообще ничего, а иконка машины продолжала ехать.
      // Пассажиры ждут вместе с машиной (docs/incidents.md).
      for (const p of [u, ...u.passengers.map(id => unitById(g, id))]) {
        if (!p?.mission || p.status === 'idle') continue;
        p.mission.pauseFrom = g.t;
        p.mission.pausedUntil = g.t + stop;
        p.phaseEnd += stop;
      }
      log(g, `🛞 ${u.name}: пробито колесо, вынужденная остановка на ${stop} мин.`, 'warn');
      emit({ kind: 'toast', text: `🛞 ${u.name}: остановка ${stop} мин`, tone: 'bad' });
      return false;
    }
    case 'vehicleDamage': {
      const [a, b] = REPAIR_FINE[u.type] || [60, 140];
      const fine = ri(a, b);
      g.funds = Math.max(0, g.funds - fine);
      g.spent += fine;
      log(g, `🔧 ${u.name}: повреждение техники, ремонт −${fine} ₽.`, 'warn');
      emit({ kind: 'toast', text: `🔧 Ремонт техники: −${fine} ₽`, tone: 'bad' });
      return false;
    }
  }
  return false;
}

/** Множитель времени хода при севшем фонаре ночью. */
export const lampSlow = (g: Game, u: Unit): number =>
  (u.mission?.lampOut && isNight(g)) ? 1 / LAMP_NIGHT_SPEED : 1;
