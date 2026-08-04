import type { Game, Unit, Cell, Sink, ActionResult, UnitType, BuildKey, Verdict, Mission, Pt } from './types';
import {
  TYPES, BUILD, MISSCAP, TENTCAP, TRAINCOST, TRAINABLE, EXPCOST, EXP_LVL, RETRAIN_LVL, RECON_MIN, lvl, W, H,
} from './constants';
import { coordName, gv, fmtDur } from './util';
import {
  cellAt, unitById, targetable, inRange, activeMissions, available, sendBlock,
  planTrip, searchEst, freeWinds, windCapacity, windMinutes, isNight,
} from './access';
import { addUnit, nextCallSign } from './generate';
import { pushLog, forceReturn, finalizeOver, setPhase } from './sim';
import { rollEvent } from './events';

const ok: ActionResult = { ok: true };
const fail = (reason: string): ActionResult => ({ ok: false, reason });

/** Квадраты, которые захватывает вылет: у вертолёта 3×3. */
function reconCells(u: Unit, cell: Cell): Pt[] {
  if (u.type !== 'drone' || u.level < 3) return [{ x: cell.x, y: cell.y }];
  const out: Pt[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = cell.x + dx, y = cell.y + dy;
    if (x >= 0 && x < W && y >= 0 && y < H) out.push({ x, y });
  }
  return out;
}

export function dispatchUnit(g: Game, u: Unit, cell: Cell, wind: Unit | null = null): void {
  const trip = planTrip(g, u, cell, wind);
  const est = u.type === 'drone' ? RECON_MIN : Math.min(24 * 60, searchEst(g, u, cell));
  const m: Mission = {
    x: cell.x, y: cell.y, travel: trip.travel, estSearch: est, swept: 0, found: [],
    track: trip.track,
    event: null, hops: 0, hopDir: null, carrier: trip.carrier, aboard: false, footShare: trip.footShare,
    pausedUntil: 0, pauseFrom: 0, gps: true, radio: true, lampOut: false,
    cells: u.type === 'drone' ? reconCells(u, cell) : undefined,
  };
  u.mission = m;
  setPhase(g, u, 'travel', trip.travel);
  m.event = rollEvent(g, u, trip.travel * 2 + est);

  if (wind) {
    wind.passengers.push(u.id);
    if (wind.status === 'idle') {
      // Машине — ТОЛЬКО её плечо: маршрут группы кончается в целевом квадрате, и по нему
      // «Ветер» проезжал бы мимо точки высадки, а потом дёргался обратно.
      wind.mission = {
        x: trip.drop.x, y: trip.drop.y, travel: Math.max(1, trip.windMin), estSearch: 0, swept: 0, found: [],
        track: trip.windTrack ?? trip.track, event: null, hops: 0, hopDir: null, carrier: null,
        aboard: false, footShare: 1, pausedUntil: 0, pauseFrom: 0, gps: true, radio: true, lampOut: false,
      };
      setPhase(g, wind, 'travel', Math.max(1, trip.windMin));
      wind.mission.event = rollEvent(g, wind, trip.windMin * 2);
    }
    const tail = trip.footMin > 0 ? `, дальше ${fmtDur(trip.footMin)} пешком` : '';
    // Имена отрядов не склоняем: строим фразу так, чтобы имя стояло в именительном.
    pushLog(g, `${TYPES[u.type].icon} ${u.name} ${gv(u, 'выехала', 'выехал')} в кв. ${coordName(cell.x, cell.y)} — подвозит ${wind.name} (в пути ~${fmtDur(trip.travel)}${tail})`);
  } else {
    pushLog(g, `${TYPES[u.type].icon} ${u.name} ${gv(u, 'выдвинулась', 'выдвинулся')} в кв. ${coordName(cell.x, cell.y)} (в пути ~${fmtDur(trip.travel)})`);
  }
}

export function actSend(g: Game, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  const s = g.ui.sel;
  if (!s) return fail('no-cell');
  const cell = cellAt(g, s.x, s.y);
  if (!targetable(cell)) { emit({ kind: 'toast', text: 'Этот квадрат нельзя обследовать', tone: 'bad' }); return fail('untargetable'); }
  if (!inRange(g, cell)) { emit({ kind: 'toast', text: 'Квадрат вне радиуса связи. Улучшите радиостанцию.', tone: 'bad' }); return fail('out-of-range'); }
  const ids = [...g.ui.selUnits];
  if (!ids.length) { emit({ kind: 'toast', text: 'Выберите хотя бы один отряд', tone: 'bad' }); return fail('no-units'); }

  // «Ветры» этого рейса: одна машина может взять несколько групп в один квадрат
  const batch: Unit[] = [];
  let sent = 0;
  for (const id of ids) {
    const u = unitById(g, id);
    if (!u || !available(g, u)) continue;
    const block = sendBlock(g, u, cell);
    if (block) { emit({ kind: 'toast', text: block, tone: 'bad' }); continue; }
    if (activeMissions(g) >= MISSCAP[g.buildings.radio]) {
      emit({ kind: 'toast', text: `Радиостанция не потянет больше ${MISSCAP[g.buildings.radio]} групп в поле`, tone: 'bad' });
      break;
    }
    let wind: Unit | null = null;
    if (u.type === 'foot' || u.type === 'dog') {
      wind = batch.find(w => w.passengers.length < windCapacity(w)) || null;
      if (!wind) {
        const cand = freeWinds(g).filter(w => !batch.includes(w) && windMinutes(g, w, g.hq, cell) != null)
          .sort((a, b) => b.level - a.level)[0];
        if (cand) { wind = cand; batch.push(cand); }
      }
    }
    dispatchUnit(g, u, cell, wind);
    g.ui.selUnits.delete(id);
    sent++;
  }
  if (sent) emit({ kind: 'toast', text: `Отправлено отрядов: ${sent} → кв. ${coordName(cell.x, cell.y)}`, tone: 'good' });
  return sent ? ok : fail('none-sent');
}

export function actBuild(g: Game, key: BuildKey, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  const b = BUILD[key];
  const cur = g.buildings[key];
  if (cur >= b.max) return fail('maxed');
  const req = b.requires?.[cur + 1];
  if (req) {
    for (const [rk, rl] of Object.entries(req) as [BuildKey, number][]) {
      if (g.buildings[rk] < rl) {
        emit({ kind: 'toast', text: `Сначала нужен «${BUILD[rk].name}» ур. ${rl}`, tone: 'bad' });
        return fail('requires');
      }
    }
  }
  const cost = b.costs[cur + 1];
  if (g.funds < cost) { emit({ kind: 'toast', text: 'Не хватает средств', tone: 'bad' }); return fail('funds'); }
  g.funds -= cost; g.spent += cost;
  g.buildings[key] = cur + 1;
  pushLog(g, `🔨 ${b.name}: уровень ${cur + 1}. ${b.lvls[cur + 1]}`, 'good');
  emit({ kind: 'toast', text: `${b.icon} ${b.name} — уровень ${cur + 1}`, tone: 'good' });
  emit({ kind: 'save' });
  return ok;
}

export function actHire(g: Game, type: UnitType, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  const T = TYPES[type];
  if (g.buildings.tent < T.unlock) { emit({ kind: 'toast', text: 'Сначала улучшите штабной шатёр', tone: 'bad' }); return fail('locked'); }
  if (g.units.length >= TENTCAP[g.buildings.tent]) { emit({ kind: 'toast', text: 'В лагере нет места. Улучшите штабной шатёр.', tone: 'bad' }); return fail('full'); }
  if (g.funds < T.cost) { emit({ kind: 'toast', text: 'Не хватает средств', tone: 'bad' }); return fail('funds'); }
  g.funds -= T.cost; g.spent += T.cost;
  addUnit(g, type);
  const u = g.units[g.units.length - 1];
  pushLog(g, `🤝 К поискам присоединился новый отряд: ${T.icon} ${u.name}`, 'good');
  emit({ kind: 'toast', text: `${T.icon} ${u.name} в строю`, tone: 'good' });
  emit({ kind: 'save' });
  return ok;
}

/** До какого уровня отряд можно обучить прямо сейчас (0 — нельзя). */
export function trainTarget(g: Game, u: Unit): number {
  const target = u.level + 1;
  if (target > TRAINABLE[u.type]) return 0;
  if (g.buildings.train < u.level) return 0;
  return target;
}

/**
 * Обучение мгновенное, но группа ПОКИДАЕТ дело: уровень сразу уходит в кампанию,
 * а отряд становится недоступен до следующего поиска (docs/units.md).
 */
export function actTrain(g: Game, id: number, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  const u = unitById(g, id);
  if (!u || !available(g, u)) return fail('busy');
  const target = trainTarget(g, u);
  if (!target) { emit({ kind: 'toast', text: 'Нужен учебный центр выше уровнем', tone: 'bad' }); return fail('no-center'); }
  const cost = TRAINCOST[target];
  if (g.funds < cost) { emit({ kind: 'toast', text: 'Не хватает средств', tone: 'bad' }); return fail('funds'); }
  g.funds -= cost; g.spent += cost;
  u.level = target;
  u.away = 'training';
  u.mission = null;
  u.status = 'idle';
  pushLog(g, `🎓 ${u.name} ${gv(u, 'ушла', 'ушёл')} на обучение — уровень ${target} (${lvl(u.type, target).name}). В этом деле группа больше не выйдет.`, 'good');
  emit({ kind: 'toast', text: `🎓 ${u.name}: уровень ${target}, но группа покинула поиск`, tone: 'good' });
  emit({ kind: 'save' });
  return ok;
}

/**
 * Переобучение: смена специализации. Как обучение — забирает группу из текущего дела; в следующем
 * деле отряд возвращается НОВЫМ бойцом выбранного типа 1-го уровня с новым позывным. Цена = наём
 * нового отряда этого типа. Личность меняем на месте — `saveCampaign` перенесёт её в ростер.
 */
export function actRetrain(g: Game, id: number, newType: UnitType, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  if (g.buildings.train < RETRAIN_LVL) { emit({ kind: 'toast', text: 'Переобучение доступно с учебного центра ур. 4', tone: 'bad' }); return fail('no-center'); }
  const u = unitById(g, id);
  if (!u || !available(g, u)) return fail('busy');
  if (newType === u.type) return fail('same-type');
  if (g.buildings.tent < TYPES[newType].unlock) { emit({ kind: 'toast', text: `Для этой специализации нужен штаб ур. ${TYPES[newType].unlock}`, tone: 'bad' }); return fail('locked'); }
  const cost = TYPES[newType].cost;
  if (g.funds < cost) { emit({ kind: 'toast', text: 'Не хватает средств', tone: 'bad' }); return fail('funds'); }
  g.funds -= cost; g.spent += cost;
  const oldName = u.name;
  const goneVerb = gv(u, 'ушла', 'ушёл');   // род читаем по СТАРОЙ личности, до подмены
  const newName = nextCallSign(g, newType);
  u.type = newType;
  u.gen = TYPES[newType].gen;
  u.name = newName;
  u.level = 1;
  u.away = 'training';
  u.mission = null;
  u.status = 'idle';
  pushLog(g, `🎓 ${oldName} ${goneVerb} на переобучение — в следующем деле вернётся как ${newName} (${TYPES[newType].name}). В этом деле группа больше не выйдет.`, 'good');
  emit({ kind: 'toast', text: `🎓 ${oldName} → ${newName}: смена специализации, группа покинула поиск`, tone: 'good' });
  emit({ kind: 'save' });
  return ok;
}

export function actRecall(g: Game, id: number, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  const u = unitById(g, id);
  if (!u || !u.mission || u.status === 'return') return fail('n/a');
  // Правило живёт в движке, а не только в разметке.
  if (g.buildings.radio < 3) { emit({ kind: 'toast', text: 'Отозвать группу с маршрута можно только с радиостанции ур. 3', tone: 'bad' }); return fail('no-radio'); }
  forceReturn(g, u, 'recall', emit);
  return ok;
}

export function actMark(g: Game, id: number, v: Verdict, emit: Sink): ActionResult {
  const c = g.clues.find(x => x.id === id);
  if (!c) return fail('no-clue');
  if (c.verdict) { emit({ kind: 'toast', text: 'По этой находке уже есть заключение экспертизы' }); return fail('has-verdict'); }
  c.mark = c.mark === v ? null : v;
  return ok;
}

export function actExpertise(g: Game, id: number, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  if (g.buildings.tent < EXP_LVL) { emit({ kind: 'toast', text: 'Анализ улик доступен со штаба ур. 3', tone: 'bad' }); return fail('no-lab'); }
  const c = g.clues.find(x => x.id === id);
  if (!c || c.exp) return fail('n/a');
  if (g.funds < EXPCOST) { emit({ kind: 'toast', text: 'Не хватает средств на экспертизу', tone: 'bad' }); return fail('funds'); }
  g.funds -= EXPCOST; g.spent += EXPCOST;
  c.markAtExp = c.mark;
  c.exp = 'wait';
  g.expQueue.push(id);
  emit({ kind: 'toast', text: `🔬 Находка передана на экспертизу (−${EXPCOST} ₽)` });
  return ok;
}

/** Свернуть поиски — единственный способ закончить дело без находки (страховка от софтлока). */
export function actAbandon(g: Game, emit: Sink): ActionResult {
  if (g.over) return fail('case-over');
  pushLog(g, '✖ Поиски свёрнуты по решению штаба. Пропавший не найден.', 'bad');
  emit({ kind: 'toast', text: '✖ Операция свёрнута', tone: 'bad' });
  finalizeOver(g, 'abandoned', null);
  return ok;
}

export function selectCell(g: Game, x: number, y: number, emit: Sink): void {
  const cell = cellAt(g, x, y);
  if (!inRange(g, cell) && targetable(cell)) {
    emit({ kind: 'toast', text: 'Квадрат вне радиуса связи — улучшите радиостанцию', tone: 'bad' });
  }
  g.ui.sel = { x, y };
}

// --- Мини-квест первой помощи (заглушка, docs/outcome.md) ---

export interface QuestStep { q: string; opts: { text: string; good: boolean }[] }

export const QUEST: QuestStep[] = [
  {
    q: 'Человек лежит на боку, дышит поверхностно, на голос почти не реагирует. Что делаете?',
    opts: [
      { text: 'Проверить дыхание и пульс, укрыть, не двигать', good: true },
      { text: 'Сразу поднять и нести к машине', good: false },
      { text: 'Дать воды и попытаться поднять на ноги', good: false },
    ],
  },
  {
    q: 'Кожа холодная, одежда мокрая, признаков травм не видно.',
    opts: [
      { text: 'Снять мокрое, укрыть, тёплое питьё малыми порциями', good: true },
      { text: 'Растереть спиртом и дать глоток для согрева', good: false },
      { text: 'Ничего не делать, ждать медиков', good: false },
    ],
  },
  {
    q: 'До ближайшей проезжей точки — 900 метров по чаще.',
    opts: [
      { text: 'Носилки из подручных, вынести к «Ветру», скорую — к точке выезда', good: true },
      { text: 'Вести под руки пешком до штаба', good: false },
      { text: 'Ждать вертолёт на месте', good: false },
    ],
  },
];

export function actQuest(g: Game, choice: number, emit: Sink): ActionResult {
  const q = g.quest;
  if (!q) return fail('no-quest');
  const step = QUEST[q.step];
  if (!step) return fail('n/a');
  const opt = step.opts[choice];
  if (!opt) return fail('bad-choice');
  if (opt.good) { q.correct++; pushLog(g, `🩹 ${opt.text} — верно.`, 'good'); }
  else pushLog(g, `🩹 ${opt.text} — так делать не стоило.`, 'warn');
  q.step++;
  if (q.step >= QUEST.length) {
    const good = q.correct;
    pushLog(g, `🚁 Пострадавший передан медикам. Верных решений: ${good} из ${QUEST.length}.`, good >= 2 ? 'good' : 'warn');
    emit({ kind: 'toast', text: good >= 2 ? '🩹 Передан медикам в стабильном состоянии' : '🩹 Состояние тяжёлое, но жив', tone: good >= 2 ? 'good' : 'bad' });
    finalizeOver(g, 'alive-late', q.by, good);
  }
  return ok;
}
