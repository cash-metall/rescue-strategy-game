import type { Game, Campaign, Cell, Pt, Profile, MapObject, UnitType, ObjClass } from './types';
import { W, H, CLR, PROFILES, ITEMS, TYPES, XP_FIRST } from './constants';
import { ri, rf, rnd, pick } from './rng';
import { clamp, dist, cheb, angleTo } from './util';

interface Tpl { text: string; photoText: string; vis: number; air: number; fromAir: boolean; cls: ObjClass; }

export function newGame(camp: Campaign): Game {
  for (let att = 0; att < 200; att++) {
    const g = tryGen(camp);
    if (g) return g;
  }
  throw new Error('genfail');
}

export function tryGen(camp: Campaign): Game | null {
  const g: Game = {
    t: 0, funds: camp.funds, incAcc: 0, spent: 0, over: null, medicsGone: false, quest: null,
    xp: 0, xpNext: XP_FIRST, donated: 0,
    weather: 'clear', weatherNext: ri(150, 320), nextEvent: ri(200, 300),
    warned: { w60: false, w35: false, w15: false },
    buildings: { ...camp.buildings },
    units: [], clues: [], sightings: [], log: [], nameCnt: { ...camp.nameCnt },
    expRuns: [], expQueue: [], objId: 1, clueId: 1, unitId: 1, sightId: 1,
    stats: { cluesTotal: 0, cluesReal: 0 },
    ui: { tab: 'hq', sel: null, selUnits: new Set<number>(), heat: false },
    map: [], profile: null as unknown as Profile, lkp: { x: 0, y: 0 }, path: [],
    trailSet: new Set<string>(), victim: { x: 0, y: 0, strength: 100, found: false },
    hq: { x: 0, y: 0 }, drainBase: 0,
  };
  // --- карта ---
  const map: Cell[][] = [];
  for (let y = 0; y < H; y++) { map.push([]); for (let x = 0; x < W; x++) map[y].push({ x, y, terrain: 'forest', coverage: 0, shown: 0, objects: [] }); }
  const blob = (terr: Cell['terrain'], seeds: number, size: number) => {
    for (let i = 0; i < seeds; i++) {
      let cx = ri(0, W - 1), cy = ri(0, H - 1);
      for (let j = 0; j < size; j++) { map[cy][cx].terrain = terr; cx = clamp(cx + ri(-1, 1), 0, W - 1); cy = clamp(cy + ri(-1, 1), 0, H - 1); }
    }
  };
  blob('dense', 4, 8); blob('meadow', 3, 7); blob('marsh', 2, 7); blob('hills', 2, 5); blob('lake', 1, 5);
  g.map = map;
  // --- профиль пропавшего ---
  const p = pick(PROFILES);
  const color = pick(CLR);
  const size = ri(36, 45);
  g.profile = { ...p, color, size, item: pick(ITEMS) };
  // --- точка последнего контакта и маршрут ---
  const lkp: Pt = { x: ri(4, 7), y: ri(6, 8) };
  if (map[lkp.y][lkp.x].terrain === 'lake' || map[lkp.y][lkp.x].terrain === 'base') map[lkp.y][lkp.x].terrain = 'forest';
  g.lkp = lkp;
  const len = ri(5, 8);
  const path: Pt[] = [{ ...lkp }];
  let dirM = rf(0, 360), guard = 0;
  while (path.length < len && guard < 400) {
    guard++;
    dirM += rf(-60, 60);
    const r = dirM * Math.PI / 180;
    const last = path[path.length - 1];
    const nx = last.x + Math.round(Math.sin(r)), ny = last.y - Math.round(Math.cos(r));
    if (nx < 0 || nx >= W || ny < 0 || ny >= H || map[ny][nx].terrain === 'lake'
      || path.some(q => q.x === nx && q.y === ny) || (nx === last.x && ny === last.y)) { dirM += 95; continue; }
    path.push({ x: nx, y: ny });
  }
  if (path.length < 5) return null;
  const end = path[path.length - 1];
  if (dist(lkp, end) < 3) return null;
  g.path = path;
  const L = path.length;
  g.trailSet = new Set(path.map(q => q.x + ',' + q.y));
  g.victim = { x: end.x, y: end.y, strength: 100, found: false };
  // --- лагерь: разворачивается рядом с ТПК (2–3 клетки), на пустой клетке — не на маршруте ---
  const campCands: Pt[] = [], campNear: Pt[] = [];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const d = cheb({ x: xx, y: yy }, lkp);
    if (d < 1 || d > 3 || map[yy][xx].terrain === 'lake' || g.trailSet.has(xx + ',' + yy)) continue;
    (d >= 2 ? campCands : campNear).push({ x: xx, y: yy });
  }
  const campCell = campCands.length ? pick(campCands) : (campNear.length ? pick(campNear) : null);
  if (!campCell) return null;
  g.hq = { x: campCell.x, y: campCell.y };
  map[g.hq.y][g.hq.x].terrain = 'base';
  // Туман войны: со старта раскрыт лагерь и соседние по Чебышёву клетки (картограф ур. 0).
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const rx = g.hq.x + dx, ry = g.hq.y + dy;
    if (rx >= 0 && rx < W && ry >= 0 && ry < H) map[ry][rx].revealed = true;
  }
  g.drainBase = 100 / (1600 + 150 * dist(g.hq, g.victim));
  // --- артефакты на маршруте ---
  // Текст артефакта НЕ содержит давности: её читает только ГСН (см. createClue).
  const artTemplates: Array<() => Tpl> = [
    () => ({ text: `Чёткий след обуви ${size} размера`, photoText: 'На фото с воздуха: следы на земле, размер не разобрать', vis: .5, air: .1, fromAir: false, cls: 'other' }),
    () => ({ text: `Обрывок ткани ${color.g} цвета на ветке`, photoText: `На фото с воздуха: лоскут ткани ${color.g} цвета на кустах`, vis: .7, air: .5, fromAir: true, cls: 'bright' }),
    () => ({ text: `Обёртка от шоколадного батончика, не выцвела`, photoText: 'На фото с воздуха: что-то блестит в траве', vis: .8, air: .3, fromAir: true, cls: 'other' }),
    () => ({ text: `Нитки ${color.g} цвета на колючих кустах`, photoText: `На фото с воздуха: цветные нитки на кустарнике, оттенок похож на ${color.n}`, vis: .6, air: .2, fromAir: false, cls: 'bright' }),
    () => ({ text: `Примятая трава и свежесломанные ветки — здесь кто-то проходил`, photoText: 'На фото с воздуха: полоса примятой травы', vis: .6, air: .4, fromAir: true, cls: 'other' }),
  ];
  let artCount = 0;
  const addArt = (node: Pt, i: number) => {
    const next = g.path[i + 1];
    const dirTrue = next ? angleTo(node, next) : null;
    const tier = i / Math.max(1, g.path.length - 1);
    const t = pick(artTemplates)();
    g.map[node.y][node.x].objects.push({
      id: g.objId++, kind: 'art', text: t.text, photoText: t.photoText, vis: t.vis, air: t.air,
      fromAir: t.fromAir, cls: t.cls,
      dirTrue, dirShow: dirTrue == null ? null : (dirTrue + rf(-25, 25) + 360) % 360, tier, found: false,
    });
    artCount++;
  };
  path.forEach((node, i) => {
    if (i === 0) { addArt(node, 0); return; }
    if (i === L - 1) { addArt(node, i); if (rnd() < 0.5) addArt(node, i); return; }
    if (rnd() < 0.75) addArt(node, i);
    if (rnd() < 0.25) addArt(node, i);
  });
  if (artCount < 4) return null;
  // Мусор физически на карте НЕ раскладывается: он виртуальный и рождается в момент осмотра
  // из junkTemplates, количеством по уровню группы (docs/units.md).
  // --- команды переносятся из кампании (отдохнувшие, без заданий) ---
  for (const r of camp.roster) {
    g.units.push({
      id: g.unitId++, type: r.type, gen: TYPES[r.type].gen, name: r.name, level: r.level,
      fatigue: 0, status: 'idle', phaseStart: 0, phaseEnd: 0, mission: null,
      away: null, busyUntil: 0, restNeed: 0, passengers: [],
    });
  }
  // --- стартовая улика на ТПК ---
  const startArt: MapObject | undefined = g.map[lkp.y][lkp.x].objects.find(o => o.kind === 'art');
  if (!startArt) return null;
  startArt.found = true;
  g.map[lkp.y][lkp.x].coverage = 25;
  g.map[lkp.y][lkp.x].shown = 25;
  g.clues.push({
    id: g.clueId++, x: lkp.x, y: lkp.y, text: startArt.text, kind: 'art',
    dirShow: startArt.dirTrue, noPos: false, tFound: 0, mark: 'real', verdict: 'real', exp: 'done',
    isNew: false, rated: true,   // данность, а не работа отряда: отклика за неё нет
  });
  // Стартовая улика — данность, а не заслуга игрока: в cluesReal она не идёт,
  // иначе штабные события сразу считали бы дело успешным (см. randomEvent).
  g.stats.cluesTotal = 1; g.stats.cluesReal = 0;
  return g;
}

/** Шаблоны «мусора». Экспортируются: объекты рождаются в момент осмотра, а не при генерации карты. */
export const junkTemplates: Array<() => Tpl> = [
  () => ({ text: `След обуви ${ri(36, 45)} размера, старый, залит водой`, photoText: 'На фото с воздуха: следы на земле, размер не разобрать', vis: .5, air: .1, fromAir: false, cls: 'other' }),
  () => ({ text: `Свежий след обуви ${ri(36, 45)} размера`, photoText: 'На фото с воздуха: следы на земле, размер не разобрать', vis: .5, air: .1, fromAir: false, cls: 'other' }),
  () => { const c = pick(CLR); return { text: `Обрывок ткани ${c.g} цвета, выцветший на солнце`, photoText: `На фото с воздуха: лоскут ткани ${c.g} цвета`, vis: .7, air: .5, fromAir: true, cls: 'bright' as ObjClass }; },
  () => ({ text: 'Ржавая консервная банка', photoText: 'На фото с воздуха: металлический блеск в траве', vis: .8, air: .3, fromAir: true, cls: 'other' }),
  () => ({ text: 'Старое кострище, углям не меньше месяца', photoText: 'На фото с воздуха: тёмное пятно кострища', vis: .9, air: .6, fromAir: true, cls: 'fire' }),
  () => ({ text: 'Пластиковая бутылка, помутневшая от времени', photoText: 'На фото с воздуха: пластиковый мусор', vis: .8, air: .4, fromAir: true, cls: 'other' }),
  () => ({ text: 'Следы крупного животного — лось или кабан', photoText: 'На фото с воздуха: цепочка следов, явно не человеческих', vis: .5, air: .15, fromAir: false, cls: 'other' }),
  () => ({ text: 'Свежее кострище и банки — похоже, стоянка охотников', photoText: 'На фото с воздуха: свежее кострище', vis: .9, air: .6, fromAir: true, cls: 'fire' }),
  () => { const c = pick(CLR); return { text: `Вязаная перчатка ${c.g} цвета, отсыревшая`, photoText: `На фото с воздуха: небольшой предмет ${c.g} цвета`, vis: .6, air: .3, fromAir: true, cls: 'bright' as ObjClass }; },
];

const DOG_NAMES = ['Альма', 'Грей', 'Байкал', 'Веста', 'Тайга', 'Норд', 'Ирма'];

/** Единый генератор позывного: инкрементит счётчик типа и собирает имя. */
export function nextCallSign(g: Game, type: UnitType): string {
  g.nameCnt[type]++;
  const n = g.nameCnt[type];
  return type === 'foot' ? 'Лиса-' + n
    : type === 'dog' ? `Кинолог-${n} · ${DOG_NAMES[(n - 1) % DOG_NAMES.length]}`
      : type === 'wind' ? 'Ветер-' + n
        : 'Коптер-' + n;
}

export function addUnit(g: Game, type: UnitType): void {
  const name = nextCallSign(g, type);
  g.units.push({
    id: g.unitId++, type, gen: TYPES[type].gen, name, level: 1, fatigue: 0,
    status: 'idle', phaseStart: 0, phaseEnd: 0, mission: null,
    away: null, busyUntil: 0, restNeed: 0, passengers: [],
  });
}
