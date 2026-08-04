import type { UnitType, Terrain, WeatherKey, BuildKey, Color, ProfileBase, IncidentKey } from './types';

export const W = 12, H = 12;

export const TERR: Record<Terrain, { name: string }> = {
  forest: { name: 'Лес' },
  dense: { name: 'Чаща' },
  meadow: { name: 'Поляна' },
  marsh: { name: 'Болото' },
  hills: { name: 'Холмы' },
  lake: { name: 'Озеро' },
  base: { name: 'Лагерь' },
};

// Модификатор КАЧЕСТВА осмотра: местность × тип юнита (нет lake/base — доступ guard-ится).
// «Ветер» не обследует квадраты вовсе, коптер не растит покрытие — их колонок здесь нет.
export const SMOD: Record<string, Record<'foot' | 'dog', number>> = {
  forest: { foot: 1.0, dog: 1.1 },
  dense: { foot: 0.8, dog: 1.0 },
  meadow: { foot: 1.1, dog: 1.0 },
  marsh: { foot: 0.7, dog: 0.8 },
  hills: { foot: 0.9, dog: 0.9 },
};

// Цена клетки при поиске пути. Отдельно для пешего и для машины — у них разная логика объезда.
// Пеший разброс узкий: болото (1.7) дешевле обхода двумя клетками леса (2.0).
// Машинный широкий: «Ветру» выгоден крюк по открытому.
export const PATHCOST: Record<'foot' | 'wind', Partial<Record<Terrain, number>>> = {
  foot: { meadow: 0.9, forest: 1.0, base: 1.0, hills: 1.25, dense: 1.4, marsh: 1.7 },
  wind: { meadow: 0.5, forest: 1.0, base: 1.0, hills: 1.3, dense: 2.6, marsh: 3.2 },
};

// Проходимость для «Ветра» по уровням. Озеро непроходимо для всех и всегда.
export const WIND_PASS: Record<number, Terrain[]> = {
  1: ['forest', 'meadow', 'hills', 'base'],
  2: ['forest', 'meadow', 'hills', 'base'],
  3: ['forest', 'meadow', 'hills', 'base', 'marsh', 'dense'],
  4: ['forest', 'meadow', 'hills', 'base', 'marsh', 'dense'],
};

export const NIGHT: Record<UnitType, number> = { foot: 0.6, dog: 0.85, wind: 0.7, drone: 0.5 };

export const WEATHER: Record<WeatherKey, { name: string; icon: string; mod: Record<UnitType, number>; drain: number }> = {
  clear: { name: 'Ясно', icon: '☀️', mod: { foot: 1, dog: 1, wind: 1, drone: 1 }, drain: 0 },
  cloudy: { name: 'Облачно', icon: '☁️', mod: { foot: 1, dog: 1, wind: 1, drone: 1 }, drain: 0 },
  rain: { name: 'Дождь', icon: '🌧️', mod: { foot: .85, dog: .6, wind: .8, drone: .7 }, drain: .015 },
  fog: { name: 'Туман', icon: '🌫️', mod: { foot: .8, dog: 1, wind: .8, drone: .3 }, drain: .006 },
};

export interface UnitTypeDef {
  gen: 'f' | 'm'; name: string; icon: string; svg: string;
  cost: number; cellMin: number; fatS: number; fatT: number; unlock: number; desc: string;
}
export const TYPES: Record<UnitType, UnitTypeDef> = {
  foot: {
    gen: 'f', name: 'Пешая поисковая группа', icon: '🥾', svg: 'units/foot.svg', cost: 100, cellMin: 12, fatS: .22, fatT: .18, unlock: 1,
    desc: 'Основная рабочая сила: ищет в любой доступной местности и только она может забрать пострадавшего. Новички приносят много мусора и не читают направление — это лечится обучением.',
  },
  dog: {
    gen: 'm', name: 'Кинолог с собакой', icon: '🐕', svg: 'units/dog.svg', cost: 320, cellMin: 13, fatS: .55, fatT: .2, unlock: 2,
    desc: 'Закрывает квадрат втрое быстрее пешей группы, с опытом читает направление, а следовая собака сама уходит по следу. Дорог, быстро выматывается пешком и требует долгого отдыха. Дождь смывает запахи.',
  },
  wind: {
    gen: 'm', name: 'Ветер (внедорожник)', icon: '🚙', svg: 'units/wind.svg', cost: 150, cellMin: 12, fatS: 0, fatT: .08, unlock: 3,
    desc: 'Не ищет сам — возит группы от штаба до квадрата и обратно. Пассажиры не устают в дороге и выходят на осмотр свежими. Не всюду проедет: болото и чащу берёт только экипаж со штурманом.',
  },
  drone: {
    gen: 'm', name: 'Коптер (БПЛА)', icon: '🛸', svg: 'units/drone.svg', cost: 260, cellMin: 3, fatS: .5, fatT: .5, unlock: 4,
    desc: 'Разведка и только: квадрат не обследует и улик не приносит, зато ставит на карту «возможные цели» — проверять их пойдёт наземная группа. Лучше всего видит костры и яркую одежду. Чащу не берёт. Дорогая игрушка: иногда вылет решает дело, иногда пустой снимок.',
  },
};

// --- Уровни отрядов ---
export const MAXLVL = 4;
// До какого уровня реально можно обучить (у dog/wind/drone 4-й — резерв-заглушка).
export const TRAINABLE: Record<UnitType, number> = { foot: 4, dog: 3, wind: 3, drone: 3 };

export interface LvlDef {
  name: string;
  detect: number;        // качество осмотра, 1.0 = опытная пешая группа
  cover: number;         // темп закрытия квадрата, ×1 = ~100 минут на квадрат
  speed: number;         // множитель скорости хода
  fat: number;           // множитель прироста усталости
  incident: number;      // вероятность инцидента за задачу
  /**
   * ОЖИДАЕМОЕ число посторонних находок за ПОЛНЫЙ проход квадрата — не квота.
   * Фактическое количество случайно: бросок идёт от прироста покрытия (см. doSearchMinute),
   * поэтому бывает и пустой выход, и три находки подряд.
   */
  junk: number;
  dir: boolean;          // определяет направление
  note: string;
}

export const LVL: Record<UnitType, LvlDef[]> = {
  foot: [
    { name: 'Новички', detect: 0.80, cover: 1, speed: 1, fat: 1.00, incident: 0.20, junk: 0.75, dir: false, note: 'Много мусора, направление не читают.' },
    { name: 'Опытные', detect: 1.00, cover: 1, speed: 1, fat: 0.90, incident: 0.10, junk: 0.34, dir: false, note: 'Мусора меньше, направление всё ещё не читают.' },
    { name: 'Старший поисковой группы', detect: 1.20, cover: 1, speed: 1, fat: 0.80, incident: 0.05, junk: 0.11, dir: true, note: 'Определяет направление, мусор почти не носит.' },
    { name: 'Группа специального назначения', detect: 1.50, cover: 1, speed: 1, fat: 0.70, incident: 0.07, junk: 0, dir: true, note: 'Направление, скорость и давность следа. Мусор не приносит. Рискует больше.' },
  ],
  // Собака работает по запаху, а не по блестящим банкам, и закрывает квадраты втрое быстрее:
  // при равном с лисой `junk` кинолог стал бы главным источником шума в игре.
  dog: [
    { name: 'Собака-стажёр', detect: 0.90, cover: 3, speed: 1, fat: 1.00, incident: 0.02, junk: 0.30, dir: false, note: 'Быстро обследует квадрат, направление не определяет.' },
    { name: 'Поисковая собака', detect: 1.00, cover: 3, speed: 1, fat: 0.92, incident: 0.02, junk: 0.20, dir: true, note: 'При находке определяет направление.' },
    { name: 'Следовая собака', detect: 1.00, cover: 3, speed: 1, fat: 0.85, incident: 0.02, junk: 0.20, dir: true, note: 'При находке сама уходит в следующий квадрат — один раз за задачу.' },
    { name: 'Резерв', detect: 1.00, cover: 3, speed: 1, fat: 0.85, incident: 0.02, junk: 0.20, dir: true, note: 'В разработке.' },
  ],
  wind: [
    { name: 'Местный на уазике', detect: 0, cover: 0, speed: 2, fat: 1.00, incident: 0.15, junk: 0, dir: false, note: 'Одна группа за раз. Не едет в болото и чащу.' },
    { name: 'Опытный водитель-поисковик', detect: 0, cover: 0, speed: 3, fat: 0.90, incident: 0.10, junk: 0, dir: false, note: 'Две группы, подбирает по пути. Не едет в болото и чащу.' },
    { name: 'Экипаж со штурманом', detect: 0, cover: 0, speed: 3, fat: 0.85, incident: 0.05, junk: 0, dir: false, note: 'Проходит болото и чащу, по дороге может подобрать улику. Рискует людьми и техникой.' },
    { name: 'Резерв', detect: 0, cover: 0, speed: 3, fat: 0.85, incident: 0.05, junk: 0, dir: false, note: 'В разработке.' },
  ],
  drone: [
    { name: 'БПЛА с камерой', detect: 0.20, cover: 0, speed: 1, fat: 1.00, incident: 0.05, junk: 0, dir: false, note: 'Только днём. Один квадрат за вылет.' },
    { name: 'БПЛА с тепловизором', detect: 0.20, cover: 0, speed: 1, fat: 0.92, incident: 0.05, junk: 0, dir: false, note: 'Летает и ночью, но в темноте видит только людей и костры.' },
    { name: 'Вертолёт', detect: 0.20, cover: 0, speed: 1, fat: 0.85, incident: 0.05, junk: 0, dir: false, note: 'Только днём, зато осматривает сразу 9 квадратов.' },
    { name: 'Резерв', detect: 0.20, cover: 0, speed: 1, fat: 0.85, incident: 0.05, junk: 0, dir: false, note: 'В разработке.' },
  ],
};

export const lvl = (type: UnitType, level: number): LvlDef => LVL[type][Math.min(MAXLVL, Math.max(1, level)) - 1];

// Вероятность находки за прирост покрытия: 1 − exp(−detect · vis · FIND_K · Δc/100).
// FIND_K = 3.0 — это прежние «0.03 за минуту × 100 минут на квадрат»: баланс эталонной группы не меняется.
export const FIND_K = 3.0;
// Базовый темп: сколько процентов покрытия в минуту даёт cover = 1 при идеальных условиях.
export const COVER_BASE = 1.0;

// Персональный множитель отдыха: кинологу нужен более долгий отдых.
export const REST_MULT: Record<UnitType, number> = { foot: 1, dog: 0.6, wind: 1, drone: 1 };
// Штраф усталости кинологу за пеший переход.
export const DOG_FOOT_FAT = 1.6;

export const TENTCAP = [0, 4, 6, 8, 10];   // вместимость лагеря по уровню шатра (1..4)
export const MISSCAP = [3, 3, 5, 6, 7];    // групп в поле по уровню радио (1..4); индекс 0 не используется
export const RANGE = [5, 5, 8, 10, 99];    // радиус связи (клетки) по уровню радио (1..4)
// Анализ улик (экспертиза) переехал из картографа в штаб: доступен с шатра ур. 3.
// Индексируются уровнем шатра (0..4); ур. 1/2 экспертизы нет.
export const EXPT = [0, 0, 0, 20, 12];  // минут на экспертизу по уровню шатра
export const EXPS = [0, 0, 0, 1, 2];    // число экспертов (параллельных экспертиз) по уровню шатра
export const EXP_LVL = 3;               // с какого уровня шатра доступна экспертиза
export const EXPCOST = 35;
export const EXPREWARD = 40;
// Множитель отдыха по уровню «места отдыха» (0..3), раздельно день/ночь.
export const RESTM_DAY = [0.3, 0.7, 1.1, 1.5];
export const RESTM_NIGHT = [0.2, 0.3, 0.7, 1.0];
// С какого уровня радиостанции группы передают описание находки сразу, не дожидаясь возвращения.
export const RADIO_LIVE_LVL = 2;

// --- «Ветер» ---
export const WIND_PASSENGERS = [0, 1, 2, 2, 2];   // по уровню
export const WIND_PICKUP_CLUE = 0.10;             // ур. 3: шанс подобрать улику в необследованном квадрате пути

// --- Коптер ---
export const RECON_MIN = 12;          // минут на разведку квадрата
export const HELI_OUTER = 0.6;        // множитель шанса на 8 внешних клетках вертолёта
export const FALSE_SIGHT = 0.15;      // шанс ложной наводки на разведанный квадрат
export const CLASS_BONUS: Record<string, number> = { fire: 2, bright: 2, other: 1 };
export const VICTIM_AIR_VIS = 0.8;

// --- События и инциденты ---
export const EVENT_CHANCE = 0.30;
export const FLAT_TIRE_STOP: [number, number] = [30, 60];
export const REPAIR_FINE: Record<string, [number, number]> = { wind: [60, 140], drone: [80, 180] };
export const LAMP_NIGHT_SPEED = 0.6;
export const LAMP_INJURY = 0.25;      // доп. проверка на травму при севшем фонаре ночью
export const PANIC_REST = 15;         // после паники нельзя отправлять, пока усталость выше
export const BUSY_CHANCE = 0.10;
export const BUSY_HOURS = 12;         // недоступна с 06:00 до 18:00

/**
 * Веса инцидентов внутри пула. Травма уносит группу до конца дела, поэтому она
 * должна быть РЕДКОЙ среди инцидентов, а не равновероятной с севшим фонарём:
 * при равных весах отряды выбывают почти в каждом деле, и поиск встаёт.
 * Ориентир: не больше одной травмы за дело.
 */
export const INCIDENTS: Record<UnitType, Partial<Record<IncidentKey, number>>> = {
  foot: { gpsDead: 30, lampDead: 25, radioDead: 20, panic: 17, injury: 8 },
  dog: { gpsDead: 30, lampDead: 25, radioDead: 20, panic: 17, injury: 8 },
  wind: { flatTire: 62, vehicleDamage: 38 },
  drone: { gpsDead: 40, vehicleDamage: 60 },
};
// Экипаж со штурманом рискует людьми: у ур. 3 добавляется травма.
export const WIND_L3_EXTRA: Partial<Record<IncidentKey, number>> = { injury: 10 };

export const INCIDENT_NAME: Record<IncidentKey, string> = {
  injury: 'травма',
  panic: 'встреча с животным',
  gpsDead: 'сели батарейки в навигаторе',
  radioDead: 'отказала рация',
  lampDead: 'сел фонарь',
  flatTire: 'пробито колесо',
  vehicleDamage: 'повреждение техники',
};

export const STORIES: { text: string; only?: UnitType }[] = [
  { text: 'вышли на старую вырубку, чуть не потеряли друг друга — собрались, идут дальше' },
  { text: 'встретили грибников: пропавшего не видели, но обещали посмотреть по своим местам' },
  { text: 'нашли шалаш охотников — пусто, свежих следов нет' },
  { text: 'провалились в старую канаву, вымокли по колено, продолжают' },
  { text: 'наткнулись на брошенную стоянку подростков: мусор свежий, но не наш случай' },
  { text: 'связь пропадала минут двадцать — рельеф, восстановили' },
  { text: 'местный лесник показал тропу, которой нет на карте' },
  { text: 'собака подняла кабана, минут десять успокаивали — обошлось', only: 'dog' },
  { text: 'дорогу перегородило упавшее дерево, объехали по краю поля', only: 'wind' },
  { text: 'порыв ветра снёс с курса, пришлось поднять выше и снимать с большей высоты', only: 'drone' },
];

export interface BuildDef {
  name: string; icon: string; max: number; costs: number[]; lvls: string[];
  /** Жёсткие кросс-требования по уровню на КОНКРЕТНЫЙ покупаемый уровень (индекс = целевой уровень). */
  requires?: (Partial<Record<BuildKey, number>> | null)[];
}
export const BUILD: Record<BuildKey, BuildDef> = {
  tent: {
    name: 'Штабной шатёр', icon: '⛺', max: 4, costs: [0, 0, 150, 300, 480],
    lvls: [
      '',
      'До 4 отрядов. Наём: пешие группы.',
      'До 6 отрядов. Открывает наём кинологов. Разрешает ночные выходы.',
      'До 8 отрядов. Открывает наём «Ветров». Анализ улик (экспертиза).',
      'До 10 отрядов. Открывает наём коптеров.',
    ],
  },
  radio: {
    name: 'Радиостанция', icon: '📻', max: 4, costs: [0, 0, 120, 260, 420],
    lvls: [
      '',
      '3 группы в поле, радиус связи 5 кв. В поле слышно только «нашли предмет» — что именно, узнаете по возвращении.',
      '5 групп в поле, радиус 8 кв. Группы передают описание находок сразу по рации.',
      '6 групп в поле, радиус 10 кв. Отзыв группы с маршрута.',
      '7 групп в поле, связь по всей карте.',
    ],
  },
  carto: {
    name: 'Картограф', icon: '🗺️', max: 3, costs: [0, 100, 220, 380],
    requires: [null, null, { tent: 3 }, null],
    lvls: [
      'Туман войны: местность скрыта, известны лишь лагерь и соседние квадраты. Маршрут — по кратчайшему числу шагов.',
      'Карта раскрыта: видна вся местность. Маршрут по-прежнему по числу шагов.',
      'Дешёвый маршрут по цене местности и карта вероятности 🔥. Требует штаб ур. 3.',
      'В осмотренном квадрате видно эффективность искавшей группы.',
    ],
  },
  rest: {
    name: 'Место отдыха и питания', icon: '🍲', max: 3, costs: [0, 80, 180, 320],
    lvls: [
      'Ночёвка в лагере: медленное восстановление, ночью ещё медленнее.',
      'Полевая кухня: восстановление быстрее (ночью — умеренно).',
      'Тёплая палатка: быстрое восстановление, ночью почти как днём.',
      'Горячее питание круглосуточно: максимальное восстановление день и ночь.',
    ],
  },
  train: {
    name: 'Учебный центр', icon: '🎓', max: 4, costs: [0, 150, 300, 480, 600],
    lvls: [
      'Нет обучения.',
      'Обучение отрядов до уровня 2.',
      'Обучение отрядов до уровня 3.',
      'Обучение пеших групп до уровня 4 (ГСН).',
      'Переобучение: смена специализации отряда (в новом деле — новый боец 1-го уровня).',
    ],
  },
};

export const TRAINCOST = [0, 0, 120, 200, 320]; // стоимость обучения ДО уровня n
export const RETRAIN_LVL = 4; // уровень учебного центра, с которого доступно переобучение (смена специализации)

export const CLR: Color[] = [
  { n: 'синий', f: 'синяя', g: 'синего' },
  { n: 'красный', f: 'красная', g: 'красного' },
  { n: 'зелёный', f: 'зелёная', g: 'зелёного' },
  { n: 'чёрный', f: 'чёрная', g: 'чёрного' },
  { n: 'жёлтый', f: 'жёлтая', g: 'жёлтого' },
];

export const PROFILES: ProfileBase[] = [
  { face: '👵', gen: 'f', name: 'Валентина Петровна', age: 74, who: 'пенсионерка', story: 'ушла в лес за грибами и не вернулась к вечеру' },
  { face: '👴', gen: 'm', name: 'Николай Иванович', age: 78, who: 'пенсионер', story: 'пошёл проверить дальние ягодные места и пропал' },
  { face: '🧒', gen: 'm', name: 'Миша', age: 9, who: 'ребёнок', story: 'отстал от группы во время загородной прогулки' },
  { face: '🧔', gen: 'm', name: 'Андрей', age: 34, who: 'турист', story: 'не вышел на связь, возвращаясь с одиночного маршрута' },
];

export const ITEMS = ['красный рюкзак', 'плетёная корзинка', 'брезентовая сумка', 'тёмный термос'];

export const SAVE_KEY = 'rescueHQ.campaign.v1';
