import type { Game, Unit, Cell, Sink, ActionResult, UnitType, BuildKey, Verdict } from './types';
import { TYPES, BUILD, MISSCAP, TENTCAP, TRAINCOST, TRAINTIME, EXPCOST } from './constants';
import { coordName, gv, fmtDur } from './util';
import { cellAt, unitById, targetable, inRange, activeMissions, travelTime } from './access';
import { addUnit } from './generate';
import { pushLog, forceReturn } from './sim';

const ok: ActionResult = { ok: true };
const fail = (reason: string): ActionResult => ({ ok: false, reason });

export function dispatchUnit(g: Game, u: Unit, cell: Cell): void {
  const tr = travelTime(g, u, cell);
  u.mission = { x: cell.x, y: cell.y, dur: g.ui.dur, travel: tr, found: [] };
  u.status = 'travel';
  u.phaseStart = g.t; u.phaseEnd = g.t + tr;
  pushLog(g, `${TYPES[u.type].icon} ${u.name} ${gv(u, 'выдвинулась', 'выдвинулся')} в кв. ${coordName(cell.x, cell.y)} (в пути ~${fmtDur(tr)})`);
}

export function actSend(g: Game, emit: Sink): ActionResult {
  const s = g.ui.sel;
  if (!s) return fail('no-cell');
  const cell = cellAt(g, s.x, s.y);
  if (!targetable(cell)) { emit({ kind: 'toast', text: 'Этот квадрат нельзя обследовать', tone: 'bad' }); return fail('untargetable'); }
  if (!inRange(g, cell)) { emit({ kind: 'toast', text: 'Квадрат вне радиуса связи. Улучшите радиостанцию.', tone: 'bad' }); return fail('out-of-range'); }
  const ids = [...g.ui.selUnits];
  if (!ids.length) { emit({ kind: 'toast', text: 'Выберите хотя бы один отряд', tone: 'bad' }); return fail('no-units'); }
  let sent = 0;
  for (const id of ids) {
    const u = unitById(g, id);
    if (!u || u.status !== 'idle') continue;
    if (activeMissions(g) >= MISSCAP[g.buildings.radio]) {
      emit({ kind: 'toast', text: `Радиостанция не потянет больше ${MISSCAP[g.buildings.radio]} групп в поле`, tone: 'bad' });
      break;
    }
    dispatchUnit(g, u, cell);
    g.ui.selUnits.delete(id);
    sent++;
  }
  if (sent) emit({ kind: 'toast', text: `Отправлено отрядов: ${sent} → кв. ${coordName(cell.x, cell.y)}`, tone: 'good' });
  return sent ? ok : fail('none-sent');
}

export function actBuild(g: Game, key: BuildKey, emit: Sink): ActionResult {
  const b = BUILD[key];
  const cur = g.buildings[key];
  if (cur >= b.max) return fail('maxed');
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

export function actTrain(g: Game, id: number, emit: Sink): ActionResult {
  const u = unitById(g, id);
  if (!u || u.status !== 'idle') return fail('busy');
  const target = u.level + 1;
  if (target > 3 || g.buildings.train < target - 1) { emit({ kind: 'toast', text: 'Нужен учебный центр выше уровнем', tone: 'bad' }); return fail('no-center'); }
  const cost = TRAINCOST[target];
  if (g.funds < cost) { emit({ kind: 'toast', text: 'Не хватает средств', tone: 'bad' }); return fail('funds'); }
  g.funds -= cost; g.spent += cost;
  u.status = 'train';
  u.phaseStart = g.t; u.phaseEnd = g.t + TRAINTIME;
  pushLog(g, `🎓 ${u.name} ${gv(u, 'направлена', 'направлен')} на обучение (${fmtDur(TRAINTIME)})`);
  return ok;
}

export function actRecall(g: Game, id: number, emit: Sink): ActionResult {
  const u = unitById(g, id);
  if (!u || !u.mission || u.status === 'return') return fail('n/a');
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
  if (g.buildings.carto < 1) { emit({ kind: 'toast', text: 'Нужен картограф', tone: 'bad' }); return fail('no-carto'); }
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

export function selectCell(g: Game, x: number, y: number, emit: Sink): void {
  const cell = cellAt(g, x, y);
  if (!inRange(g, cell) && targetable(cell)) {
    emit({ kind: 'toast', text: 'Квадрат вне радиуса связи — улучшите радиостанцию', tone: 'bad' });
  }
  g.ui.sel = { x, y };
}
