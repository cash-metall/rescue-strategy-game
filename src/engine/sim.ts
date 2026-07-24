import type { Game, Unit, Cell, MapObject, Sink } from './types';
import { TYPES, WEATHER, RESTM, EXPS, EXPT, EXPREWARD } from './constants';
import { ri, rf, rnd, pick } from './rng';
import { cheb, coordName, gv, fmtDur, plural } from './util';
import { cellAt, clueById, isNight, searchEff } from './access';

export function pushLog(g: Game, txt: string, cls?: string): void {
  g.log.unshift({ t: g.t, txt, cls });
  if (g.log.length > 250) g.log.pop();
}

export function simMinute(g: Game, emit: Sink): void {
  g.t++;
  // приток пожертвований
  g.incAcc += 0.55;
  if (g.incAcc >= 1) { const a = Math.floor(g.incAcc); g.funds += a; g.incAcc -= a; }
  // погода
  if (g.t >= g.weatherNext) changeWeather(g);
  // состояние пропавшего
  let drain = g.drainBase;
  if (isNight(g)) drain *= 1.2;
  drain += WEATHER[g.weather].drain;
  g.victim.strength = Math.max(0, g.victim.strength - drain);
  checkVictimWarnings(g, emit);
  if (g.victim.strength <= 0) { finalizeOver(g, false, null); return; }
  // отряды
  for (const u of g.units) {
    if (g.over) return;
    stepUnit(g, u, emit);
  }
  // экспертиза
  g.expRuns = g.expRuns.filter(r => {
    if (g.t >= r.tEnd) { finishExpertise(g, r.id, emit); return false; }
    return true;
  });
  while (g.expQueue.length && g.expRuns.length < EXPS[g.buildings.carto]) {
    const id = g.expQueue.shift()!;
    const c = clueById(g, id);
    if (!c) continue;
    c.exp = 'run';
    g.expRuns.push({ id, tEnd: g.t + EXPT[g.buildings.carto] });
  }
  // события
  if (g.t >= g.nextEvent) { randomEvent(g, emit); g.nextEvent = g.t + ri(200, 340); }
}

export function stepUnit(g: Game, u: Unit, emit: Sink): void {
  const T = TYPES[u.type];
  switch (u.status) {
    case 'idle': {
      const rec = (u.type === 'drone' ? 1.4 : 0.45) * RESTM[g.buildings.rest];
      u.fatigue = Math.max(0, u.fatigue - rec);
      break;
    }
    case 'train':
      if (g.t >= u.phaseEnd) {
        u.level++; u.status = 'idle';
        emit({ kind: 'save' });
        pushLog(g, `🎓 ${u.name} ${gv(u, 'завершила', 'завершил')} обучение — уровень ${u.level}`, 'good');
        emit({ kind: 'toast', text: `🎓 ${u.name}: уровень ${u.level}!`, tone: 'good' });
      }
      break;
    case 'travel':
      u.fatigue = Math.min(100, u.fatigue + T.fatT * lvlFat(u));
      if (u.fatigue >= 100) {
        forceReturn(g, u, u.type === 'drone' ? 'battery' : 'exhausted', emit);
      } else if (g.t >= u.phaseEnd) {
        u.status = 'search';
        u.phaseStart = g.t; u.phaseEnd = g.t + u.mission!.dur;
        pushLog(g, `${T.icon} ${u.name} ${gv(u, 'прибыла', 'прибыл')} в кв. ${coordName(u.mission!.x, u.mission!.y)}, начат осмотр`);
      }
      break;
    case 'search': {
      doSearchMinute(g, u, emit);
      if (g.over) return;
      if (u.fatigue >= 100) {
        forceReturn(g, u, u.type === 'drone' ? 'battery' : 'exhausted', emit);
      } else if (g.t >= u.phaseEnd) {
        voiceCheck(g, u, emit);
        forceReturn(g, u, 'done', emit);
      }
      break;
    }
    case 'return':
      u.fatigue = Math.min(100, u.fatigue + T.fatT * lvlFat(u) * 0.6);
      if (g.t >= u.phaseEnd) arrive(g, u, emit);
      break;
  }
}

const lvlFat = (u: Unit): number => 1 - 0.2 * (u.level - 1);

export function doSearchMinute(g: Game, u: Unit, emit: Sink): void {
  const c = cellAt(g, u.mission!.x, u.mission!.y);
  const e = searchEff(g, u, c);
  c.coverage = Math.min(100, c.coverage + e);
  c.touched = true;
  const onTrail = g.trailSet.has(c.x + ',' + c.y);
  const dogB = (u.type === 'dog' && onTrail) ? 1.5 : 1;
  for (const o of c.objects) {
    if (o.found) continue;
    const vis = u.type === 'drone' ? o.air : o.vis;
    const p = 1 - Math.exp(-e * vis * 0.03 * dogB);
    if (rnd() < p) {
      o.found = true;
      if (u.type === 'drone') {
        u.mission!.photos = (u.mission!.photos || 0) + 1;
        createClue(g, o, c, false, true);
        emit({ kind: 'toast', text: `🛸 ${u.name} передал фото находки (кв. ${coordName(c.x, c.y)})`, tone: 'good' });
      } else {
        u.mission!.found.push(o);
        pushLog(g, `📻 ${u.name}: «Обнаружили предмет, осматриваем дальше» (кв. ${coordName(c.x, c.y)})`);
      }
    }
  }
  if (!g.victim.found && g.victim.x === c.x && g.victim.y === c.y) {
    const vis = u.type === 'drone' ? 0.9 : 1.2;
    const p = 1 - Math.exp(-e * vis * 0.035 * dogB);
    if (rnd() < p) { foundVictim(g, u); return; }
  }
  u.fatigue = Math.min(100, u.fatigue + TYPES[u.type].fatS * lvlFat(u));
}

export function voiceCheck(g: Game, u: Unit, emit: Sink): void {
  const c = { x: u.mission!.x, y: u.mission!.y };
  if (g.victim.found) return;
  if (cheb(c, g.victim) === 1) {
    const p = u.type === 'dog' ? 0.4 : 0.15;
    if (rnd() < p) {
      pushLog(g, `📢 ${u.name}: «Показалось, слышали слабый голос рядом с кв. ${coordName(c.x, c.y)}!»`, 'warn');
      emit({ kind: 'toast', text: `📢 Возможный отклик рядом с кв. ${coordName(c.x, c.y)}!`, tone: 'good' });
    }
  }
}

export function forceReturn(g: Game, u: Unit, reason: 'exhausted' | 'battery' | 'recall' | 'done', emit: Sink): void {
  const m = u.mission!;
  let ret: number;
  if (u.status === 'travel') {
    const p = clamp((g.t - u.phaseStart) / Math.max(1, u.phaseEnd - u.phaseStart), 0, 1);
    ret = Math.max(2, Math.round((u.phaseEnd - u.phaseStart) * p));
    m.retFrom = { x: g.hq.x + (m.x - g.hq.x) * p, y: g.hq.y + (m.y - g.hq.y) * p };
  } else {
    ret = m.travel;
    m.retFrom = null;
  }
  if (u.fatigue >= 100) ret = Math.round(ret * 1.3);
  u.status = 'return';
  u.phaseStart = g.t; u.phaseEnd = g.t + ret;
  if (reason === 'exhausted') { pushLog(g, `😮‍💨 ${u.name} ${gv(u, 'выбилась', 'выбился')} из сил и возвращается в лагерь`, 'warn'); emit({ kind: 'toast', text: `😮‍💨 ${u.name} возвращается: нет сил`, tone: 'bad' }); }
  else if (reason === 'battery') { pushLog(g, `🪫 ${u.name}: заряд на исходе, возврат на базу`, 'warn'); emit({ kind: 'toast', text: `🪫 ${u.name} возвращается: разряжен`, tone: 'bad' }); }
  else if (reason === 'recall') { pushLog(g, `📻 ${u.name} ${gv(u, 'отозвана', 'отозван')} в лагерь по рации`); }
  else { pushLog(g, `${TYPES[u.type].icon} ${u.name} ${gv(u, 'завершила', 'завершил')} осмотр кв. ${coordName(m.x, m.y)} и возвращается`); }
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function arrive(g: Game, u: Unit, emit: Sink): void {
  const m = u.mission!;
  u.status = 'idle'; u.mission = null;
  const found = m.found;
  const back = gv(u, 'вернулась', 'вернулся');
  if (found.length) {
    for (const o of found) createClue(g, o, m, u.type === 'dog', false);
    emit({ kind: 'toast', text: `${TYPES[u.type].icon} ${u.name} ${back}: ${found.length} ${plural(found.length, 'находка', 'находки', 'находок')}`, tone: 'good' });
    pushLog(g, `${TYPES[u.type].icon} ${u.name} в лагере, доставлено находок: ${found.length}`, 'good');
  } else if (m.photos) {
    emit({ kind: 'toast', text: `${TYPES[u.type].icon} ${u.name} ${back}; фото передано ранее: ${m.photos}`, tone: 'good' });
    pushLog(g, `${TYPES[u.type].icon} ${u.name} в лагере; переданных с воздуха фото: ${m.photos}`, 'good');
  } else {
    emit({ kind: 'toast', text: `${TYPES[u.type].icon} ${u.name} ${back} без находок` });
    pushLog(g, `${TYPES[u.type].icon} ${u.name} в лагере, находок нет`);
  }
}

export function createClue(g: Game, obj: MapObject, at: { x: number; y: number }, byDog: boolean, photo: boolean): void {
  let dirShow = obj.dirShow;
  if (photo) dirShow = (obj.dirTrue != null ? (obj.dirTrue + rf(-40, 40) + 360) % 360 : null);
  else if (byDog && obj.dirTrue != null) dirShow = obj.dirTrue;
  g.clues.unshift({
    id: g.clueId++, x: at.x, y: at.y,
    text: photo ? obj.photoText : obj.text,
    kind: obj.kind, dirShow, photo, tFound: g.t,
    mark: null, verdict: null, exp: null, isNew: true, paid: false,
  });
  g.stats.cluesTotal++;
}

export function finishExpertise(g: Game, id: number, emit: Sink): void {
  const c = clueById(g, id);
  if (!c) return;
  c.exp = 'done';
  c.verdict = c.kind === 'art' ? 'real' : 'junk';
  const correct = (c.markAtExp === 'real' && c.verdict === 'real') || (c.markAtExp === 'junk' && c.verdict === 'junk');
  if (correct) g.funds += EXPREWARD;
  if (c.verdict === 'real') {
    g.stats.cluesReal++;
    if (c.dirShow == null && !c.photo) {
      pushLog(g, `🔬 Экспертиза (кв. ${coordName(c.x, c.y)}): улика принадлежит пропавшему. След совсем свежий — он где-то рядом!`, 'good');
    } else {
      pushLog(g, `🔬 Экспертиза (кв. ${coordName(c.x, c.y)}): улика принадлежит пропавшему.`, 'good');
    }
    if (c.markAtExp === 'junk') pushLog(g, `⚠️ Вы посчитали её мусором — оценка ошибочна, отметка исправлена.`, 'warn');
  } else {
    pushLog(g, `🔬 Экспертиза (кв. ${coordName(c.x, c.y)}): находка не относится к делу.`);
    if (c.markAtExp === 'real') pushLog(g, `⚠️ Ложный след из кв. ${coordName(c.x, c.y)} убран с карты.`, 'warn');
  }
  if (correct) emit({ kind: 'toast', text: `🔬 Ваша оценка подтвердилась! +${EXPREWARD} ₽`, tone: 'good' });
  else if (c.markAtExp) emit({ kind: 'toast', text: '🔬 Экспертиза расходится с вашей отметкой', tone: 'bad' });
  else emit({ kind: 'toast', text: '🔬 Экспертиза завершена', tone: 'good' });
}

export function changeWeather(g: Game): void {
  const keys = (Object.keys(WEATHER) as (keyof typeof WEATHER)[]).filter(k => k !== g.weather);
  g.weather = pick(keys);
  g.weatherNext = g.t + ri(150, 360);
  const w = WEATHER[g.weather];
  pushLog(g, `${w.icon} Погода изменилась: ${w.name.toLowerCase()}`);
  if (g.weather === 'rain') pushLog(g, '🌧️ Дождь смывает запахи — кинологам будет тяжело', 'warn');
  if (g.weather === 'fog') pushLog(g, '🌫️ Туман: дроны почти бесполезны, зато собакам он не помеха', 'warn');
}

export function checkVictimWarnings(g: Game, emit: Sink): void {
  const s = g.victim.strength;
  if (s < 60 && !g.warned.w60) { g.warned.w60 = true; pushLog(g, '🩺 Врачи: время работает против нас. Состояние пропавшего ухудшается.', 'warn'); emit({ kind: 'toast', text: '🩺 Состояние пропавшего ухудшается', tone: 'bad' }); }
  if (s < 35 && !g.warned.w35) { g.warned.w35 = true; pushLog(g, '🩺 Врачи серьёзно обеспокоены. Нужно ускорить поиски!', 'bad'); emit({ kind: 'toast', text: '🩺 Врачи серьёзно обеспокоены!', tone: 'bad' }); }
  if (s < 15 && !g.warned.w15) { g.warned.w15 = true; pushLog(g, '🩺 Критическое состояние. Счёт идёт на часы.', 'bad'); emit({ kind: 'toast', text: '🚨 Критическое состояние!', tone: 'bad' }); }
}

export function randomEvent(g: Game, emit: Sink): void {
  const r = rnd();
  if (r < 0.3) {
    g.funds += 70;
    pushLog(g, '🥧 Местные жители привезли в лагерь еду и тёплые вещи (+70 ₽)', 'good');
  } else if (r < 0.55) {
    const hasReal = g.clues.some(c => c.verdict === 'real');
    const a = hasReal ? 140 : 60;
    g.funds += a;
    pushLog(g, hasReal ? `📺 Сюжет о поисках вышел в новостях — пожертвования выросли (+${a} ₽)` : `🤝 Волонтёрские взносы (+${a} ₽)`, 'good');
  } else {
    let cell: { x: number; y: number } | null = null;
    if (rnd() < 0.55) {
      cell = g.path[ri(1, g.path.length - 1)];
    } else {
      for (let gTry = 0; gTry < 60; gTry++) {
        const t = { x: ri(0, 11), y: ri(0, 11) };
        if (g.trailSet.has(t.x + ',' + t.y) || g.map[t.y][t.x].terrain === 'lake' || g.map[t.y][t.x].terrain === 'base' || distLite(t, g.lkp) < 2) continue;
        cell = t; break;
      }
    }
    if (!cell) return;
    pushLog(g, `📞 Звонок в штаб: «Кажется, видели человека в районе кв. ${coordName(cell.x, cell.y)}». Информация не проверена!`, 'warn');
    emit({ kind: 'toast', text: `📞 Наводка: кв. ${coordName(cell.x, cell.y)} (не проверено)` });
  }
}

const distLite = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

export function foundVictim(g: Game, u: Unit): void {
  g.victim.found = true;
  pushLog(g, `🎉 ${u.name} ${gv(u, 'НАШЛА', 'НАШЁЛ')} ПРОПАВШЕГО в кв. ${coordName(g.victim.x, g.victim.y)}! Начата эвакуация.`, 'good');
  finalizeOver(g, true, u.name);
}

// Заполняет g.over данными итогов. НЕ трогает кампанию/паузу — это делает стор (onCaseEnd).
export function finalizeOver(g: Game, win: boolean, by: string | null): void {
  const hrs = Math.floor(g.t / 60), mins = g.t % 60;
  const searched = g.map.flat().filter(c => c.touched).length;
  const score = win ? Math.max(0, Math.round(g.victim.strength * 10 + 500 - g.t / 10)) : 0;
  g.over = {
    win, by,
    hrs, mins, searched,
    cluesTotal: g.stats.cluesTotal, cluesReal: g.stats.cluesReal,
    spent: g.spent, strength: g.victim.strength, score,
  };
}
