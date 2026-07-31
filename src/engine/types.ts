// Типы движка. Только данные — никакого DOM/Svelte.

export type UnitType = 'foot' | 'dog' | 'wind' | 'drone';
export type Terrain = 'forest' | 'dense' | 'meadow' | 'marsh' | 'hills' | 'lake' | 'base';
export type WeatherKey = 'clear' | 'cloudy' | 'rain' | 'fog';
export type BuildKey = 'tent' | 'radio' | 'carto' | 'rest' | 'train';
export type Gender = 'f' | 'm';
export type Tone = 'good' | 'bad';
export type UnitStatus = 'idle' | 'travel' | 'search' | 'return';
export type Verdict = 'real' | 'junk';
export type TabKey = 'hq' | 'units' | 'clues' | 'case' | 'log';

// Выбытие отряда до конца дела.
export type Away = 'training' | 'injured';

// Исход дела. Заменяет прежний Over.win: boolean.
export type Outcome = 'alive' | 'alive-late' | 'dead' | 'abandoned';

// Инциденты на задаче (incidents.md).
export type IncidentKey =
  | 'injury' | 'panic' | 'gpsDead' | 'radioDead' | 'lampDead' | 'flatTire' | 'vehicleDamage';

// Категория объекта — для бонусов коптеру и ночного тепловизора.
export type ObjClass = 'fire' | 'bright' | 'other';

export interface Pt { x: number; y: number; }

export interface Color { n: string; f: string; g: string; }

export interface MapObject {
  id: number;
  kind: 'art' | 'junk';
  text: string;
  photoText: string;
  vis: number;
  air: number;
  fromAir: boolean;   // принципиальная видимость с воздуха (отдельно от заметности air)
  cls: ObjClass;
  dirTrue: number | null;
  dirShow: number | null;
  tier: number;
  found: boolean;
}

export interface Cell {
  x: number;
  y: number;
  terrain: Terrain;
  coverage: number;   // фактическое покрытие — правда для движка
  shown: number;      // отображаемое покрытие (при gpsDead отстаёт от coverage)
  objects: MapObject[];
  touched?: boolean;
}

// Событие на задаче: инцидент или нейтральная история.
export interface MissionEvent {
  kind: 'incident' | 'story';
  key: IncidentKey | null;
  at: number;          // абсолютная минута, когда сработает
  text: string;
  applied: boolean;
}

export interface Mission {
  x: number;
  y: number;
  travel: number;          // минут в пути до квадрата
  estSearch: number;       // прогноз минут на осмотр (для UI)
  /**
   * Прогресс ЭТОГО прохода, 0..100. Каждое посещение — свой полный проход по квадрату:
   * cell.coverage = лучший из проходов, а находки катаются от прироста внутри прохода.
   * Иначе клетка со 100% покрытия становилась бы «мёртвой» — в ней нельзя было бы
   * найти ничего и никогда, включая пропущенного пропавшего.
   */
  swept: number;
  found: MapObject[];      // что несут в штаб (если связи не хватает на живую передачу)
  retFrom?: Pt | null;
  route?: Pt[];            // найденный путь (для отрисовки и «улик по пути»)
  junkAt: number[];        // отметки покрытия, на которых всплывёт мусор
  event: MissionEvent | null;
  hops: number;            // переходы следовой собаки (максимум 1)
  hopDir: number | null;   // направление найденного следа — куда собака поведёт группу
  carrier: number | null;  // id «Ветра», который вёз группу
  footShare: number;       // доля пути, пройденная пешком (0 = всю дорогу везли)
  pausedUntil: number;     // вынужденная остановка (пробитое колесо)
  gps: boolean;            // работает ли навигатор
  radio: boolean;          // работает ли рация группы
  lampOut: boolean;        // сел фонарь
  cells?: Pt[];            // разведанные квадраты (вертолёт — 3×3)
}

export interface Unit {
  id: number;
  type: UnitType;
  gen: Gender;
  name: string;
  level: number;
  fatigue: number;
  status: UnitStatus;
  phaseStart: number;
  phaseEnd: number;
  mission: Mission | null;
  away: Away | null;       // выбыла до конца дела
  busyUntil: number;       // занята по работе до этой минуты (проверка в 06:00)
  restNeed: number;        // после паники: пока fatigue > restNeed, отправка запрещена
  passengers: number[];    // у «Ветра» — id перевозимых групп
}

export interface Clue {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: 'art' | 'junk';
  dirShow: number | null;
  noPos: boolean;          // улика без привязки к карте (gpsDead)
  tFound: number;
  mark: Verdict | null;
  verdict: Verdict | null;
  exp: 'wait' | 'run' | 'done' | null;
  markAtExp?: Verdict | null;
  isNew: boolean;
}

// Наводка «возможная цель» — то, что приносит коптер и телефонные звонки.
export interface Sighting {
  id: number;
  x: number;
  y: number;
  kind: 'human' | 'object';
  text: string;
  t: number;
  real: boolean;           // внутренняя правда, игроку не показывается
  checked: boolean;        // квадрат уже обследован наземной группой
}

export interface ProfileBase {
  face: string;
  gen: Gender;
  name: string;
  age: number;
  who: string;
  story: string;
}
export interface Profile extends ProfileBase {
  color: Color;
  size: number;
  item: string;
}

export interface Victim { x: number; y: number; strength: number; found: boolean; }

// Мини-квест первой помощи и эвакуации (запускается при исходе alive-late).
export interface Quest {
  step: number;            // 0..2
  correct: number;
  by: string | null;
}

export interface Over {
  outcome: Outcome;
  by: string | null;
  hrs: number;
  mins: number;
  searched: number;
  cluesTotal: number;
  cluesReal: number;
  spent: number;
  strength: number;
  score: number;
  questCorrect?: number;
}

export interface UiState {
  tab: TabKey;
  sel: Pt | null;
  selUnits: Set<number>;
  heat: boolean;
}

export interface LogLine { t: number; txt: string; cls?: string; }

export interface Game {
  t: number;
  funds: number;
  incAcc: number;
  spent: number;
  over: Over | null;
  medicsGone: boolean;
  quest: Quest | null;
  weather: WeatherKey;
  weatherNext: number;
  nextEvent: number;
  warned: { w60: boolean; w35: boolean; w15: boolean };
  buildings: Record<BuildKey, number>;
  units: Unit[];
  clues: Clue[];
  sightings: Sighting[];
  log: LogLine[];
  nameCnt: Record<UnitType, number>;
  expRuns: { id: number; tEnd: number }[];
  expQueue: number[];
  objId: number;
  clueId: number;
  unitId: number;
  sightId: number;
  stats: { cluesTotal: number; cluesReal: number };
  ui: UiState;
  map: Cell[][];
  profile: Profile;
  lkp: Pt;
  path: Pt[];
  trailSet: Set<string>;
  victim: Victim;
  hq: Pt;
  drainBase: number;
}

// --- Кампания (мета-прогресс, localStorage) ---
export interface RosterEntry { type: UnitType; name: string; level: number; }
export interface CampStats { alive: number; dead: number; missing: number; }
export interface Campaign {
  buildings: Record<BuildKey, number>;
  roster: RosterEntry[];
  nameCnt: Record<UnitType, number>;
  stats: CampStats;
}

// --- Побочные эффекты движка (эфемерный UI) ---
export type Fx =
  | { kind: 'toast'; text: string; tone?: Tone }
  | { kind: 'save' };
export type Sink = (fx: Fx) => void;

export interface ActionResult { ok: boolean; reason?: string; }

// --- Порт хранилища (localStorage в браузере, объект в памяти в тестах) ---
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
