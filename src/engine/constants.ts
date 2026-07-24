import type { UnitType, Terrain, WeatherKey, BuildKey, Color, ProfileBase } from './types';

export const W = 12, H = 12;

export const TERR: Record<Terrain, { name: string; emoji: string }> = {
  forest: { name: 'Лес', emoji: '' },
  dense: { name: 'Чаща', emoji: '🌲' },
  meadow: { name: 'Поляна', emoji: '🌼' },
  marsh: { name: 'Болото', emoji: '🌾' },
  hills: { name: 'Холмы', emoji: '⛰' },
  lake: { name: 'Озеро', emoji: '💧' },
  base: { name: 'Лагерь', emoji: '' },
};

// Модификатор эффективности поиска: местность × тип юнита (нет lake/base — доступ guard-ится).
export const SMOD: Record<string, Record<UnitType, number>> = {
  forest: { foot: 1.0, dog: 1.1, atv: 0.8, drone: 0.6 },
  dense: { foot: 0.8, dog: 1.0, atv: 0.4, drone: 0.25 },
  meadow: { foot: 1.1, dog: 1.0, atv: 1.3, drone: 1.5 },
  marsh: { foot: 0.7, dog: 0.8, atv: 0.45, drone: 1.3 },
  hills: { foot: 0.9, dog: 0.9, atv: 1.15, drone: 1.2 },
};

// Модификатор времени в пути.
export const TMOD: Record<string, Record<UnitType, number>> = {
  forest: { foot: 1.0, dog: 1.0, atv: 1.2, drone: 1.0 },
  dense: { foot: 1.4, dog: 1.3, atv: 2.0, drone: 1.0 },
  meadow: { foot: 0.9, dog: 0.9, atv: 0.6, drone: 1.0 },
  marsh: { foot: 1.8, dog: 1.6, atv: 2.5, drone: 1.0 },
  hills: { foot: 1.3, dog: 1.2, atv: 1.5, drone: 1.0 },
};

export const NIGHT: Record<UnitType, number> = { foot: 0.6, dog: 0.85, atv: 0.7, drone: 0.5 };

export const WEATHER: Record<WeatherKey, { name: string; icon: string; mod: Record<UnitType, number>; drain: number }> = {
  clear: { name: 'Ясно', icon: '☀️', mod: { foot: 1, dog: 1, atv: 1, drone: 1 }, drain: 0 },
  cloudy: { name: 'Облачно', icon: '☁️', mod: { foot: 1, dog: 1, atv: 1, drone: 1 }, drain: 0 },
  rain: { name: 'Дождь', icon: '🌧️', mod: { foot: .85, dog: .6, atv: .8, drone: .7 }, drain: .015 },
  fog: { name: 'Туман', icon: '🌫️', mod: { foot: .8, dog: 1, atv: .8, drone: .3 }, drain: .006 },
};

export interface UnitTypeDef {
  gen: 'f' | 'm'; name: string; icon: string; svg: string;
  cost: number; power: number; cellMin: number; fatS: number; fatT: number; unlock: number; desc: string;
}
export const TYPES: Record<UnitType, UnitTypeDef> = {
  foot: {
    gen: 'f', name: 'Пешая группа', icon: '🥾', svg: 'units/foot.svg', cost: 100, power: 1.0, cellMin: 12, fatS: .4, fatT: .18, unlock: 1,
    desc: 'Универсальные поисковики. Надёжны в любом лесу, но не быстры.',
  },
  dog: {
    gen: 'm', name: 'Кинолог с собакой', icon: '🐕', svg: 'units/dog.svg', cost: 180, power: 1.3, cellMin: 13, fatS: .45, fatT: .2, unlock: 1,
    desc: 'Лучше всех берёт след: на маршруте пропавшего ищет заметно эффективнее и точно определяет направление. Дождь смывает запахи.',
  },
  atv: {
    gen: 'm', name: 'Квадроцикл', icon: '🚙', svg: 'units/atv.svg', cost: 150, power: 0.85, cellMin: 5, fatS: .3, fatT: .08, unlock: 2,
    desc: 'Быстро добирается куда угодно и почти не устаёт в дороге — незаменим для дальних открытых квадратов. Но с седла в чаще и болоте много не разглядишь.',
  },
  drone: {
    gen: 'm', name: 'Дрон', icon: '🛸', svg: 'units/drone.svg', cost: 260, power: 2.2, cellMin: 3, fatS: .8, fatT: .5, unlock: 3,
    desc: 'Мгновенно на месте, отлично осматривает открытую местность, фото находок уходят в штаб сразу. Под кронами леса почти слеп; направление по аэрофото — лишь приблизительное. Расходует заряд.',
  },
};

export const TENTCAP = [0, 3, 5, 7];
export const MISSCAP = [2, 3, 4, 6];
export const RANGE = [5, 7, 10, 99];
export const EXPT = [0, 20, 12, 6];
export const EXPS = [0, 1, 2, 3];
export const EXPCOST = 35;
export const EXPREWARD = 40;
export const RESTM = [1, 1.7, 2.4, 3.2];

export interface BuildDef { name: string; icon: string; svg: string; max: number; costs: number[]; lvls: string[]; }
export const BUILD: Record<BuildKey, BuildDef> = {
  tent: {
    name: 'Штабной шатёр', icon: '⛺', svg: 'hq/tent.svg', max: 3, costs: [0, 0, 150, 300],
    lvls: ['', 'До 3 отрядов. Наём: пешие группы, кинологи.', 'До 5 отрядов. Открывает наём квадроциклов.', 'До 7 отрядов. Открывает наём дронов.'],
  },
  radio: {
    name: 'Радиостанция', icon: '📻', svg: 'hq/radio.svg', max: 3, costs: [0, 120, 240, 400],
    lvls: ['2 группы в поле, радиус связи 5 кв.', '3 группы в поле, радиус 7 кв.', '4 группы в поле, радиус 10 кв.', '6 групп в поле, связь по всей карте и отзыв группы с маршрута.'],
  },
  carto: {
    name: 'Картограф', icon: '🗺️', svg: 'hq/carto.svg', max: 3, costs: [0, 100, 220, 380],
    lvls: ['Нет анализа улик.', 'Экспертиза улик (20 мин) и карта вероятности 🔥.', '2 эксперта, экспертиза 12 мин.', '3 эксперта, экспертиза 6 мин.'],
  },
  rest: {
    name: 'Место отдыха и питания', icon: '🍲', svg: 'hq/rest.svg', max: 3, costs: [0, 80, 180, 320],
    lvls: ['Отдых в лагере: базовый темп.', 'Полевая кухня: отдых ×1,7.', 'Тёплая палатка: отдых ×2,4.', 'Горячее питание круглосуточно: отдых ×3,2.'],
  },
  train: {
    name: 'Учебный центр', icon: '🎓', svg: 'hq/train.svg', max: 2, costs: [0, 150, 300],
    lvls: ['Нет обучения.', 'Обучение отрядов до уровня 2.', 'Обучение отрядов до уровня 3.'],
  },
};

export const TRAINCOST = [0, 0, 120, 200]; // стоимость обучения ДО уровня n
export const TRAINTIME = 90;

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
