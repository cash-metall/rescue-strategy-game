import type { Game, Unit, Cell, MapObject, Sink, Outcome, Pt, UnitStatus, Track } from './types';
import {
  TYPES, WEATHER, EXPS, EXPT, EXPREWARD, lvl, FIND_K, RADIO_LIVE_LVL,
  DOG_FOOT_FAT, RECON_MIN, HELI_OUTER, FALSE_SIGHT, CLASS_BONUS, VICTIM_AIR_VIS,
  WIND_PICKUP_CLUE, BUSY_CHANCE, BUSY_HOURS, W, H,
} from './constants';
import { ri, rf, rnd, pick } from './rng';
import { cheb, coordName, gv, plural, dirName } from './util';
import {
  cellAt, clueById, unitById, unitCell, unitFloat, isNight, hourOf, detectEff, coverRate, searchEst,
  restRate, freeWinds, windMinutes, windCapacity, readsDir, available, phaseProgress, homeTrack,
} from './access';
import { findPath, moverOf } from './path';
import { buildTrack, trackEnd, withStart } from './track';
import { rollEvent, applyEvent, lampSlow } from './events';
import { junkTemplates } from './generate';

/**
 * Единственная точка смены фазы отряда: статус, окно времени и траектория — вместе.
 *
 * ИНВАРИАНТ: новая траектория обязана начинаться там, где отряд стоит сейчас
 * (`unitFloat` до вызова). Иначе иконка на карте телепортируется, а рендер, который
 * рисует позицию по времени, честно проигрывает этот прыжок как полёт через карту.
 * Заодно снимается вынужденная остановка: она относилась к прошлой фазе.
 */
export function setPhase(g: Game, u: Unit, status: UnitStatus, minutes: number, track?: Track): void {
  u.status = status;
  u.phaseStart = g.t;
  u.phaseEnd = g.t + Math.max(1, Math.round(minutes));
  const m = u.mission;
  if (!m) return;
  if (track) m.track = track;
  m.pauseFrom = 0;
  m.pausedUntil = 0;
}

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
  // проверка занятости — ровно в 06:00 каждого дня
  if ((8 * 60 + g.t) % 1440 === 6 * 60) busyCheck(g, emit);
  // состояние пропавшего
  if (!g.medicsGone && !g.victim.found) {
    let drain = g.drainBase;
    if (isNight(g)) drain *= 1.2;
    drain += WEATHER[g.weather].drain;
    g.victim.strength = Math.max(0, g.victim.strength - drain);
    checkVictimWarnings(g, emit);
    if (g.victim.strength <= 0) medicsLeave(g, emit);
  }
  // отряды
  for (const u of g.units) {
    if (g.over || g.quest) return;
    stepUnit(g, u, emit);
    revealUnderUnit(g, u);
  }
  // экспертиза
  g.expRuns = g.expRuns.filter(r => {
    if (g.t >= r.tEnd) { finishExpertise(g, r.id, emit); return false; }
    return true;
  });
  while (g.expQueue.length && g.expRuns.length < EXPS[g.buildings.tent]) {
    const id = g.expQueue.shift()!;
    const c = clueById(g, id);
    if (!c) continue;
    c.exp = 'run';
    g.expRuns.push({ id, tEnd: g.t + EXPT[g.buildings.tent] });
  }
  // штабные события
  if (g.t >= g.nextEvent) { randomEvent(g, emit); g.nextEvent = g.t + ri(200, 340); }
}

/** Медики снимаются с дежурства. Дело НЕ заканчивается — меняются только ставки. */
function medicsLeave(g: Game, emit: Sink): void {
  g.medicsGone = true;
  pushLog(g, '🚑 Медицинская бригада снята с дежурства. Поиск продолжается, но за жизнь пропавшего уже никто не отвечает: шансы найти живым — 50/50.', 'bad');
  emit({ kind: 'toast', text: '🚑 Медики уехали. Шансы 50/50', tone: 'bad' });
}

/** Раз в сутки в 06:00 каждый отряд проверяется на занятость по работе. */
function busyCheck(g: Game, emit: Sink): void {
  let hit = 0;
  for (const u of g.units) {
    if (u.away) continue;
    if (rnd() >= BUSY_CHANCE) continue;
    u.busyUntil = g.t + BUSY_HOURS * 60;
    hit++;
    if (u.status === 'idle') {
      pushLog(g, `🧰 ${u.name}: «Мне сегодня на работу кровь из носу, чем ${gv(u, 'смогла', 'смог')} — ${gv(u, 'помогла', 'помог')}, вечером вернусь.»`, 'warn');
    } else {
      pushLog(g, `🧰 ${u.name}: «Квадрат домучаю и поеду на работу — вечером вернусь.»`, 'warn');
    }
  }
  if (hit) emit({ kind: 'toast', text: `🧰 До 18:00 недоступны: ${hit} ${plural(hit, 'отряд', 'отряда', 'отрядов')}` });
}

/** Туман: клетка раскрывается, когда в неё входит группа (в т.ч. транзитом по маршруту). */
function revealUnderUnit(g: Game, u: Unit): void {
  if (!u.mission) return;
  const f = unitFloat(g, u);
  if (!f) return;
  const x = Math.round(f.x), y = Math.round(f.y);
  if (x >= 0 && x < W && y >= 0 && y < H) g.map[y][x].revealed = true;
}

export function stepUnit(g: Game, u: Unit, emit: Sink): void {
  const T = TYPES[u.type];

  // событие могло выпасть на любую фазу
  if (u.mission && u.mission.event && !u.mission.event.applied && g.t >= u.mission.event.at) {
    const bailed = applyEvent(g, u, emit, pushLog, (unit, reason) => forceReturn(g, unit, reason, emit));
    if (bailed) return;
  }

  switch (u.status) {
    case 'idle': {
      u.fatigue = Math.max(0, u.fatigue - restRate(g, u));
      if (u.restNeed > 0 && u.fatigue <= u.restNeed) u.restNeed = 0;
      break;
    }
    case 'travel': {
      const m = u.mission!;
      if (g.t < m.pausedUntil) break;                       // стоим с пробитым колесом
      // Ехать больше не за кем — разворачиваемся, не доезжая (см. windHasWork).
      if (u.type === 'wind' && !windHasWork(g, u)) { windGiveUp(g, u, emit); break; }
      // усталость только за пеший участок: на «Ветре» пассажиры не устают
      const share = u.type === 'wind' ? 1 : m.footShare;
      const dogPen = u.type === 'dog' ? DOG_FOOT_FAT : 1;
      u.fatigue = Math.min(100, u.fatigue + T.fatT * lvl(u.type, u.level).fat * share * dogPen);
      if (u.fatigue >= 100 && u.type !== 'wind') {
        forceReturn(g, u, u.type === 'drone' ? 'battery' : 'exhausted', emit);
      } else if (g.t >= u.phaseEnd) {
        if (u.type === 'wind') { windArrived(g, u, emit); break; }
        setPhase(g, u, 'search', u.type === 'drone' ? RECON_MIN : Math.min(24 * 60, m.estSearch));
        pushLog(g, `${T.icon} ${u.name} ${gv(u, 'прибыла', 'прибыл')} в кв. ${coordName(m.x, m.y)}, ${u.type === 'drone' ? 'ведёт съёмку' : 'начат осмотр'}`);
      }
      break;
    }
    case 'search': {
      const m = u.mission!;
      if (u.type === 'drone') {
        u.fatigue = Math.min(100, u.fatigue + T.fatS * lvl(u.type, u.level).fat);
        if (u.fatigue >= 100) { forceReturn(g, u, 'battery', emit); break; }
        if (g.t >= u.phaseEnd) { doReconPass(g, u, emit); forceReturn(g, u, 'done', emit); }
        break;
      }
      doSearchMinute(g, u, emit);
      if (g.over || g.quest) return;
      const hardEnd = u.phaseStart + Math.ceil(Math.min(24 * 60, m.estSearch) * 2.5);
      if (u.fatigue >= 100) {
        forceReturn(g, u, 'exhausted', emit);
      } else if (m.swept >= 100 || g.t >= hardEnd) {
        voiceCheck(g, u, emit);
        if (!tryHop(g, u, emit)) forceReturn(g, u, 'done', emit);
      }
      break;
    }
    case 'return': {
      const m = u.mission!;
      if (g.t < m.pausedUntil) break;
      if (u.type !== 'wind') {
        // Устаёт, пока идёт сама. В машине (aboard) — нет; ждать её она не ждёт.
        const share = m.aboard ? 0 : 1;
        u.fatigue = Math.min(100, u.fatigue + T.fatT * lvl(u.type, u.level).fat * 0.6 * share * (u.type === 'dog' ? DOG_FOOT_FAT : 1));
      }
      if (g.t >= u.phaseEnd) arrive(g, u, emit);
      break;
    }
  }
}

/**
 * Есть ли у рейса «Ветра» смысл — хоть один пассажир, который всё ещё ждёт **именно его**.
 * Пропадает по ходу дороги: группа дошла до лагаря сама, её перехватила другая машина,
 * отказала рация или группа выбыла. Без этой проверки «Ветер» докатывал рейс до конца
 * и возвращался порожняком — самый заметный источник бессмысленных поездок по карте.
 */
function windHasWork(g: Game, w: Unit): boolean {
  for (const id of w.passengers) {
    const p = unitById(g, id);
    if (p?.mission && p.mission.carrier === w.id) return true;
  }
  return false;
}

/** Рейс потерял смысл — «Ветер» разворачивается там, где есть, не доезжая до цели. */
function windGiveUp(g: Game, u: Unit, emit: Sink): void {
  const back = Math.max(1, Math.round((u.phaseEnd - u.phaseStart) * phaseProgress(u, g.t)));
  const track = homeTrack(g, u);
  u.passengers = [];
  setPhase(g, u, 'return', back, track);
  pushLog(g, `🚙 ${u.name}: подбирать некого, ${gv(u, 'развернулась', 'развернулся')} в лагерь`);
  emit({ kind: 'toast', text: `🚙 ${u.name}: подбирать некого` });
}

/** «Ветер» доехал до точки высадки — разворачивается домой. */
function windArrived(g: Game, u: Unit, emit: Sink): void {
  const m = u.mission!;
  // ур. 3: по дороге через необследованные квадраты можно что-то подобрать.
  // Точки трека здесь — клетки автомобильного плеча (обратный ход строится ниже).
  if (u.level >= 3) {
    for (const p of m.track.pts) {
      const x = Math.round(p.x), y = Math.round(p.y);
      const c = cellAt(g, x, y);
      if (c.coverage > 0 || c.terrain === 'base') continue;
      if (!g.victim.found && g.victim.x === x && g.victim.y === y && rnd() < WIND_PICKUP_CLUE) {
        pushLog(g, `🚙 ${u.name}: «Стой! Человек у дороги в кв. ${coordName(x, y)}!»`, 'good');
        foundVictim(g, u, emit);
        return;
      }
      const obj = c.objects.find(o => !o.found);
      if (obj && rnd() < WIND_PICKUP_CLUE) {
        obj.found = true;
        deliverClue(g, u, obj, c, emit);
        pushLog(g, `🚙 ${u.name}: подобрали кое-что по дороге в кв. ${coordName(x, y)}`, 'good');
      }
    }
  }
  // Кого забираем. Группа машину не ждала — она шла пешком навстречу, поэтому
  // подбираем её там, где она успела оказаться, а не там, куда «Ветер» ехал.
  let meetCell: Pt = { x: m.x, y: m.y };
  const riders: { u: Unit; at: Pt; from: Pt }[] = [];
  for (const pid of u.passengers) {
    const pass = unitById(g, pid);
    if (!pass?.mission || pass.status !== 'return') continue;   // уже дошла до лагеря либо ещё работает
    if (pass.mission.carrier !== u.id) continue;                // ждёт другую машину — не наш пассажир
    const at = unitCell(g, pass);
    if (windMinutes(g, u, at, g.hq) == null) {                  // в такую глушь не подъехать
      pass.mission.carrier = null;
      pushLog(g, `🚙 ${u.name}: до кв. ${coordName(at.x, at.y)} не подъехать — ${pass.name} возвращается пешком`, 'warn');
      continue;
    }
    if (!riders.length) meetCell = at;                          // разворачиваемся у первой группы
    riders.push({ u: pass, at, from: unitFloat(g, pass) ?? at });
  }

  // Время обратной дороги — от точки встречи. Крюк за остальными не считаем,
  // но машина физически не может приехать в лагерь раньше тех, кого везёт:
  // у «Ветра» и у всех пассажиров одно и то же время прибытия.
  const backMin = windMinutes(g, u, meetCell, g.hq) ?? m.travel;
  const returnMin = Math.max(1, Math.round(backMin * lampSlow(g, u)));

  // Каждый едет из своей точки: машина стоит там, куда доехала, группы — там, куда успели
  // дойти пешком, а второго пассажира «Ветер» и вовсе подбирает крюком. Сшивать их в одну
  // точку нельзя — это ровно тот прыжок, который на карте выглядит как полёт иконки.
  // Дорога у всех своя, время прибытия общее: машина догоняет пеших уже по пути.
  for (const r of riders) {
    r.u.mission!.aboard = true;
    const pts = withStart(r.from, findPath(g, r.at, g.hq, 'wind', u.level).cells);
    setPhase(g, r.u, 'return', returnMin, buildTrack(g, pts, 'wind'));
    pushLog(g, `🚙 ${u.name} ${gv(u, 'забрала', 'забрал')} в кв. ${coordName(r.at.x, r.at.y)}: ${r.u.name}`);
  }

  const carHome = withStart(trackEnd(m.track), findPath(g, { x: m.x, y: m.y }, g.hq, 'wind', u.level).cells);
  setPhase(g, u, 'return', returnMin, buildTrack(g, carHome, 'wind'));
}

const fresh = (tier: number): string => tier < 0.34 ? 'примерно суточной давности' : (tier < 0.7 ? 'довольно свежий' : 'совсем свежий');
const pace = (): string => pick(['шёл ровным шагом, около 3 км/ч', 'двигался медленно, не быстрее 2 км/ч', 'шёл торопливо, до 4 км/ч']);

/** Отдаёт находку игроку: сразу по рации (радио ≥ 2) либо в рюкзак до возвращения. */
function deliverClue(g: Game, u: Unit, obj: MapObject, at: Pt, emit: Sink): void {
  const live = u.type === 'wind' || g.buildings.radio >= RADIO_LIVE_LVL;
  const m = u.mission;
  if (live || !m) {
    createClue(g, u, obj, at);
    if (m && !m.gps) {
      pushLog(g, `📻 ${u.name}: «Есть находка, но навигатор сел — координаты не привяжем.» ${obj.text}`, 'warn');
    } else {
      pushLog(g, `📻 ${u.name} (кв. ${coordName(at.x, at.y)}): ${obj.text}`);
    }
    emit({ kind: 'toast', text: `🔍 ${u.name}: находка в кв. ${coordName(at.x, at.y)}`, tone: 'good' });
  } else {
    m.found.push(obj);
    pushLog(g, `📻 ${u.name}: «Обнаружили предмет, осматриваем дальше» (кв. ${coordName(at.x, at.y)})`);
  }
}

export function doSearchMinute(g: Game, u: Unit, emit: Sink): void {
  const m = u.mission!;
  const c = cellAt(g, m.x, m.y);
  const rate = coverRate(g, u, c);
  // Каждое посещение — свой проход 0→100: повторный визит даёт свежие броски,
  // поэтому квадрат никогда не становится «мёртвым» (см. Mission.swept).
  const before = m.swept;
  m.swept = Math.min(100, before + rate);
  const dc = m.swept - before;
  c.coverage = Math.max(c.coverage, m.swept);
  c.touched = true;
  c.revealed = true;
  c.searchedEff = detectEff(u);   // картограф ур. 3 покажет качество осмотра по квадрату
  if (m.gps) c.shown = Math.max(c.shown, c.coverage);
  // проверенные наводки гаснут
  for (const s of g.sightings) if (!s.checked && s.x === c.x && s.y === c.y) s.checked = true;

  const det = detectEff(u);
  // настоящие находки — по обычной формуле, независимо от мусора
  for (const o of c.objects) {
    if (o.found) continue;
    const p = 1 - Math.exp(-det * o.vis * FIND_K * dc / 100);
    if (rnd() < p) {
      o.found = true;
      deliverClue(g, u, o, c, emit);
      if (o.kind === 'art' && o.dirTrue != null && u.type === 'dog' && u.level >= 3 && m.hops < 1) {
        m.hopDir = o.dirTrue;
      }
    }
  }
  // мусор: всплывает на заранее выбранных отметках прохода
  while (m.junkAt.length && m.swept >= m.junkAt[0]) {
    m.junkAt.shift();
    const t = pick(junkTemplates)();
    const obj: MapObject = {
      id: g.objId++, kind: 'junk', text: t.text, photoText: t.photoText, vis: t.vis, air: t.air,
      fromAir: t.fromAir, cls: t.cls, dirTrue: null, dirShow: rf(0, 360), tier: 0, found: true,
    };
    deliverClue(g, u, obj, c, emit);
  }
  // сам пропавший
  if (!g.victim.found && g.victim.x === c.x && g.victim.y === c.y) {
    const p = 1 - Math.exp(-det * 1.2 * FIND_K * dc / 100);
    if (rnd() < p) { foundVictim(g, u, emit); return; }
  }
  u.fatigue = Math.min(100, u.fatigue + TYPES[u.type].fatS * lvl(u.type, u.level).fat);
}

/** Разведка коптера: покрытие не растёт, объекты не помечаются — только наводки. */
export function doReconPass(g: Game, u: Unit, emit: Sink): void {
  const m = u.mission!;
  const cells: Pt[] = m.cells && m.cells.length ? m.cells : [{ x: m.x, y: m.y }];
  const det = detectEff(u);
  const night = isNight(g);
  let put = 0;

  for (const p of cells) {
    if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H) continue;
    const c = cellAt(g, p.x, p.y);
    if (c.terrain === 'dense' || c.terrain === 'base') continue;
    const outer = (p.x !== m.x || p.y !== m.y) ? HELI_OUTER : 1;

    // человек по описанию
    if (!g.victim.found && g.victim.x === p.x && g.victim.y === p.y) {
      const pv = 1 - Math.exp(-det * VICTIM_AIR_VIS * FIND_K * outer);
      if (rnd() < pv) {
        addSighting(g, p, 'human', 'Вижу человека, по описанию совпадает', true, m.gps);
        pushLog(g, `🛸 ${u.name}: «Вижу человека в кв. ${coordName(p.x, p.y)}, по описанию совпадает!» Забрать может только наземная группа.`, 'good');
        emit({ kind: 'toast', text: `🛸 Возможная цель: кв. ${coordName(p.x, p.y)}`, tone: 'good' });
        put++;
        continue;
      }
    }
    // предметы, видимые с воздуха (ночью тепловизор их не берёт)
    if (!night || u.level === 2) {
      const seen = c.objects.filter(o => !o.found && o.fromAir && (!night || o.cls === 'fire'));
      let marked = false;
      for (const o of seen) {
        const pp = 1 - Math.exp(-det * o.air * CLASS_BONUS[o.cls] * FIND_K * outer);
        if (rnd() < pp) { marked = true; addSighting(g, p, 'object', o.photoText, true, m.gps); break; }
      }
      if (marked) { put++; continue; }
    }
    // ложная наводка — цена дешёвой разведки
    if (rnd() < FALSE_SIGHT * outer) {
      addSighting(g, p, 'object', 'Что-то вижу на снимке — не человек, но, возможно, имеет отношение', false, m.gps);
      put++;
    }
  }

  if (put) {
    pushLog(g, `🛸 ${u.name}: со снимков отмечено «возможных целей»: ${put}`, 'good');
    if (!m.gps) pushLog(g, `🛰️ Телеметрия сбилась — часть наводок без точной привязки.`, 'warn');
  } else {
    pushLog(g, `🛸 ${u.name}: на снимках ничего примечательного`);
  }
}

function addSighting(g: Game, at: Pt, kind: 'human' | 'object', text: string, real: boolean, gps: boolean): void {
  g.sightings.unshift({
    id: g.sightId++, x: at.x, y: at.y, kind, text, t: g.t, real, checked: !gps ? false : false,
  });
  if (g.sightings.length > 40) g.sightings.pop();
}

/** Следовая собака: после находки уходит по направлению в соседний квадрат. Максимум один раз. */
function tryHop(g: Game, u: Unit, emit: Sink): boolean {
  const m = u.mission!;
  const dir = m.hopDir;
  if (dir == null || m.hops >= 1 || u.type !== 'dog' || u.level < 3) return false;
  const r = dir * Math.PI / 180;
  const nx = m.x + Math.round(Math.sin(r)), ny = m.y - Math.round(Math.cos(r));
  if (nx < 0 || nx >= W || ny < 0 || ny >= H) return false;
  const c = cellAt(g, nx, ny);
  if (c.terrain === 'lake' || c.terrain === 'base' || c.coverage >= 100) return false;

  m.hops++;
  m.hopDir = null;
  const from: Pt = { x: m.x, y: m.y };          // группа стоит в прежнем квадрате
  m.x = nx; m.y = ny;
  m.swept = 0;
  m.estSearch = Math.min(24 * 60, searchEst(g, u, c));
  const leg = Math.max(2, Math.round(TYPES[u.type].cellMin / lvl(u.type, u.level).speed));
  m.travel += leg;
  m.footShare = 1;
  // Новый переход — своя траектория: без неё группу рисовало бы по маршруту от штаба.
  setPhase(g, u, 'travel', leg, buildTrack(g, [from, { x: nx, y: ny }], moverOf(u.type)));
  pushLog(g, `🐕 ${u.name}: собака взяла след и уводит группу в кв. ${coordName(nx, ny)} (${dirName(dir)})`, 'good');
  emit({ kind: 'toast', text: `🐕 Собака идёт по следу → кв. ${coordName(nx, ny)}`, tone: 'good' });
  return true;
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

export type ReturnReason = 'exhausted' | 'battery' | 'recall' | 'done' | 'injury' | 'panic' | 'radioDead';

export function forceReturn(g: Game, u: Unit, reason: ReturnReason, emit: Sink): void {
  const m = u.mission!;
  // Дорогу домой строим ДО смены фазы: она начинается там, где отряд стоит сейчас —
  // посреди маршрута при развороте, в квадрате при возврате с осмотра.
  const track = homeTrack(g, u);
  let ret: number;
  if (u.status === 'travel') {
    ret = Math.max(2, Math.round((u.phaseEnd - u.phaseStart) * phaseProgress(u, g.t)));
  } else {
    ret = m.travel;
  }
  // Время пешего возврата считаем ДО поиска машины: `tryPickup` должен знать, сколько у неё
  // есть минут, иначе она поедет за группой, которая дойдёт сама раньше, чем машина доедет.
  if (u.fatigue >= 100) ret = Math.round(ret * 1.3);
  ret = Math.max(1, Math.round(ret * lampSlow(g, u)));

  // обратная дорога: если есть свободный «Ветер» и связь — он выедет навстречу.
  // Время возврата при этом не меняется: группа идёт пешком, пока машина её не догонит
  // (windArrived пересчитает прибытие по точке встречи). Поэтому здесь она — пешая,
  // со всеми пешими штрафами.
  const car = m.carrier != null ? unitById(g, m.carrier) : null;
  const carOnWay = !!car && car.status === 'travel' && car.passengers.includes(u.id);
  if (reason !== 'radioDead' && m.radio && u.type !== 'wind' && u.type !== 'drone') {
    // Машина уже в пути к нам (везла на задачу и не доехала) — второй звать нельзя:
    // она перехватила бы `carrier`, а первая осталась бы кататься порожняком.
    if (!carOnWay && !tryPickup(g, u, ret, emit)) m.carrier = null;
  } else {
    m.carrier = null;
  }
  m.aboard = false;
  setPhase(g, u, 'return', ret, track);

  if (reason === 'exhausted') { pushLog(g, `😮‍💨 ${u.name} ${gv(u, 'выбилась', 'выбился')} из сил и возвращается в лагерь`, 'warn'); emit({ kind: 'toast', text: `😮‍💨 ${u.name} возвращается: нет сил`, tone: 'bad' }); }
  else if (reason === 'battery') { pushLog(g, `🪫 ${u.name}: заряд на исходе, возврат на базу`, 'warn'); emit({ kind: 'toast', text: `🪫 ${u.name} возвращается: разряжен`, tone: 'bad' }); }
  else if (reason === 'recall') { pushLog(g, `📻 ${u.name} ${gv(u, 'отозвана', 'отозван')} в лагерь по рации`); }
  else if (reason === 'done') { pushLog(g, `${TYPES[u.type].icon} ${u.name} ${gv(u, 'завершила', 'завершил')} работу в кв. ${coordName(m.x, m.y)} и возвращается`); }
}

/**
 * Пробует выслать свободный «Ветер» навстречу группе. true — машина выехала.
 * `ret` — сколько минут группе идти пешком: машина нужна только если успеет её застать.
 */
function tryPickup(g: Game, u: Unit, ret: number, _emit: Sink): boolean {
  const m = u.mission!;
  const cell = cellAt(g, m.x, m.y);
  for (const w of freeWinds(g)) {
    const there = windMinutes(g, w, g.hq, cell);
    if (there == null) continue;
    // Группа машину не ждёт, а идёт. Если та доедет позже, чем группа дойдёт сама, рейс
    // пустой от начала до конца: «Ветер» прокатится туда и обратно ни за чем, попутно рискуя
    // инцидентом. Особенно заметно на близких квадратах и на развороте в начале маршрута,
    // где `ret` — считанные минуты.
    if (there >= ret) continue;
    // «Ветер» выезжает навстречу
    w.passengers = [u.id];
    w.mission = {
      x: m.x, y: m.y, travel: there, estSearch: 0, swept: 0, found: [],
      track: buildTrack(g, findPath(g, g.hq, cell, 'wind', w.level).cells, 'wind'),
      junkAt: [], event: null, hops: 0, hopDir: null, carrier: null, aboard: false, footShare: 1,
      pausedUntil: 0, pauseFrom: 0, gps: true, radio: true, lampOut: false,
    };
    setPhase(g, w, 'travel', there);
    m.carrier = w.id;
    pushLog(g, `🚙 ${w.name} выехал навстречу группе из кв. ${coordName(m.x, m.y)} (${u.name})`);

    // Опытный водитель (ур. 2+) заодно подберёт вторую группу, если крюк невелик.
    // Время поездки от этого не растёт — крюк «бесплатен» (см. windArrived).
    if (w.level >= 2 && w.passengers.length < windCapacity(w)) {
      const budget = Math.max(8, Math.round(there * 0.5));
      let bestU: Unit | null = null, bestDetour = Infinity;
      for (const o of g.units) {
        if (o === u || o.type === 'wind' || !o.mission) continue;
        if (o.status !== 'return' || o.mission.carrier != null || !o.mission.radio) continue;
        const oc = cellAt(g, o.mission.x, o.mission.y);
        const detour = windMinutes(g, w, cell, oc);
        if (detour == null || detour > budget) continue;
        if (windMinutes(g, w, oc, g.hq) == null) continue;    // оттуда домой не выехать
        if (detour < bestDetour) { bestU = o; bestDetour = detour; }
      }
      if (bestU) {
        w.passengers.push(bestU.id);
        bestU.mission!.carrier = w.id;   // время не трогаем: тоже идёт пешком, пока не подберут
        pushLog(g, `🚙 ${w.name} по дороге захватит и ${bestU.name} из кв. ${coordName(bestU.mission!.x, bestU.mission!.y)} (крюк ${bestDetour} мин)`);
      }
    }
    return true;
  }
  return false;
}

export function arrive(g: Game, u: Unit, emit: Sink): void {
  const m = u.mission!;
  u.status = 'idle'; u.mission = null;
  const back = gv(u, 'вернулась', 'вернулся');

  if (u.type === 'wind') {
    u.passengers = [];
    pushLog(g, `🚙 ${u.name} ${back} в лагерь`);
    return;
  }

  const found = m.found;
  if (found.length) {
    for (const o of found) createClue(g, u, o, m, !m.gps);
    emit({ kind: 'toast', text: `${TYPES[u.type].icon} ${u.name} ${back}: ${found.length} ${plural(found.length, 'находка', 'находки', 'находок')}`, tone: 'good' });
    pushLog(g, `${TYPES[u.type].icon} ${u.name} в лагере, доставлено находок: ${found.length}`, 'good');
  } else if (g.buildings.radio >= RADIO_LIVE_LVL) {
    // Рация ур. ≥ 2: находки (если были) уже переданы по рации в поле, на возвращении их не
    // дублируем и не пишем «без находок» — просто отмечаем прибытие.
    emit({ kind: 'toast', text: `${TYPES[u.type].icon} ${u.name} ${back} в штаб` });
    pushLog(g, `${TYPES[u.type].icon} ${u.name} в лагере`);
  } else {
    emit({ kind: 'toast', text: `${TYPES[u.type].icon} ${u.name} ${back} без находок` });
    pushLog(g, `${TYPES[u.type].icon} ${u.name} в лагере, находок нет`);
  }

  // травма — группа выбывает до конца дела
  if (m.event && m.event.applied && m.event.key === 'injury') {
    u.away = 'injured';
    pushLog(g, `🚑 ${u.name} выбывает из поиска до следующего дела.`, 'bad');
  }
}

export function createClue(g: Game, u: Unit, obj: MapObject, at: Pt, noPos = false): void {
  const m = u.mission;
  const hidden = noPos || (m ? !m.gps : false);
  let dirShow: number | null = null;
  if (obj.dirTrue != null && readsDir(u)) {
    dirShow = u.type === 'dog' ? obj.dirTrue : obj.dirShow;
  }
  let text = obj.text;
  // ГСН читает давность и скорость — остальные приносят только сам предмет
  if (obj.kind === 'art' && u.type === 'foot' && u.level >= 4) {
    text += `. След ${fresh(obj.tier)}` + (obj.dirTrue != null ? `; ${pace()}, направление ${dirName(obj.dirTrue)}` : '');
  }
  g.clues.unshift({
    id: g.clueId++, x: at.x, y: at.y, text,
    kind: obj.kind, dirShow, noPos: hidden, tFound: g.t,
    mark: null, verdict: null, exp: null, isNew: true,
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
    pushLog(g, `🔬 Экспертиза (кв. ${coordName(c.x, c.y)}): улика принадлежит пропавшему.`, 'good');
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
  if (g.weather === 'fog') pushLog(g, '🌫️ Туман: коптеры почти бесполезны, зато собакам он не помеха', 'warn');
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
    // Порог по числу ПОДТВЕРЖДЁННЫХ игроком улик: стартовая улика на ТПК одна и не считается за успех.
    const big = g.stats.cluesReal >= 2;
    const a = big ? 140 : 60;
    g.funds += a;
    pushLog(g, big ? `📺 Сюжет о поисках вышел в новостях — пожертвования выросли (+${a} ₽)` : `🤝 Волонтёрские взносы (+${a} ₽)`, 'good');
  } else {
    let cell: Pt | null = null;
    let real = false;
    if (rnd() < 0.55) {
      cell = g.path[ri(1, g.path.length - 1)];
      real = true;
    } else {
      for (let gTry = 0; gTry < 60; gTry++) {
        const t = { x: ri(0, W - 1), y: ri(0, H - 1) };
        if (g.trailSet.has(t.x + ',' + t.y) || g.map[t.y][t.x].terrain === 'lake' || g.map[t.y][t.x].terrain === 'base' || Math.hypot(t.x - g.lkp.x, t.y - g.lkp.y) < 2) continue;
        cell = t; break;
      }
    }
    if (!cell) return;
    addSighting(g, cell, 'human', 'Звонок в штаб: «Кажется, видели человека в этом районе». Информация не проверена', real, true);
    pushLog(g, `📞 Звонок в штаб: «Кажется, видели человека в районе кв. ${coordName(cell.x, cell.y)}». Информация не проверена!`, 'warn');
    emit({ kind: 'toast', text: `📞 Наводка: кв. ${coordName(cell.x, cell.y)} (не проверено)` });
  }
}

export function foundVictim(g: Game, u: Unit, emit: Sink): void {
  g.victim.found = true;
  const who = u.name;
  if (!g.medicsGone) {
    pushLog(g, `🎉 ${who} ${gv(u, 'НАШЛА', 'НАШЁЛ')} ПРОПАВШЕГО в кв. ${coordName(g.victim.x, g.victim.y)}! Начата эвакуация.`, 'good');
    finalizeOver(g, 'alive', who);
    return;
  }
  // медиков нет — 50/50, и бросок делается один раз
  if (rnd() < 0.5) {
    pushLog(g, `🕯 ${who}: пропавший найден в кв. ${coordName(g.victim.x, g.victim.y)}, но помощь пришла слишком поздно.`, 'bad');
    emit({ kind: 'toast', text: '🕯 Найден, погиб', tone: 'bad' });
    finalizeOver(g, 'dead', who);
  } else {
    pushLog(g, `🩹 ${who}: пропавший найден ЖИВЫМ в кв. ${coordName(g.victim.x, g.victim.y)}! Состояние тяжёлое — нужна первая помощь.`, 'good');
    emit({ kind: 'toast', text: '🩹 Найден жив! Требуется первая помощь', tone: 'good' });
    g.quest = { step: 0, correct: 0, by: who };
  }
}

// Заполняет g.over данными итогов. НЕ трогает кампанию/паузу — это делает стор (onCaseEnd).
export function finalizeOver(g: Game, outcome: Outcome, by: string | null, questCorrect?: number): void {
  const hrs = Math.floor(g.t / 60), mins = g.t % 60;
  const searched = g.map.flat().filter(c => c.touched).length;
  let score = 0;
  if (outcome === 'alive') score = Math.max(0, Math.round(g.victim.strength * 10 + 500 - g.t / 10));
  else if (outcome === 'alive-late') {
    const mult = [0.7, 0.85, 1.0, 1.15][Math.min(3, questCorrect ?? 0)];
    score = Math.max(0, Math.round((300 - g.t / 20) * mult));
  } else if (outcome === 'dead') score = Math.max(0, Math.round(120 - g.t / 30));
  g.over = {
    outcome, by,
    hrs, mins, searched,
    cluesTotal: g.stats.cluesTotal, cluesReal: g.stats.cluesReal,
    spent: g.spent, strength: g.victim.strength, score, questCorrect,
  };
  g.quest = null;
}
