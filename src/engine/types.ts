// Типы движка. Только данные — никакого DOM/Svelte.

export type UnitType = 'foot' | 'dog' | 'atv' | 'drone';
export type Terrain = 'forest' | 'dense' | 'meadow' | 'marsh' | 'hills' | 'lake' | 'base';
export type WeatherKey = 'clear' | 'cloudy' | 'rain' | 'fog';
export type BuildKey = 'tent' | 'radio' | 'carto' | 'rest' | 'train';
export type Gender = 'f' | 'm';
export type Tone = 'good' | 'bad';
export type UnitStatus = 'idle' | 'travel' | 'search' | 'return' | 'train';
export type Verdict = 'real' | 'junk';
export type TabKey = 'hq' | 'units' | 'clues' | 'case' | 'log';

export interface Pt { x: number; y: number; }

export interface Color { n: string; f: string; g: string; }

export interface MapObject {
  id: number;
  kind: 'art' | 'junk';
  text: string;
  photoText: string;
  vis: number;
  air: number;
  dirTrue: number | null;
  dirShow: number | null;
  tier: number;
  found: boolean;
}

export interface Cell {
  x: number;
  y: number;
  terrain: Terrain;
  coverage: number;
  objects: MapObject[];
  touched?: boolean;
}

export interface Mission {
  x: number;
  y: number;
  dur: number;
  travel: number;
  found: MapObject[];
  photos?: number;
  retFrom?: Pt | null;
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
}

export interface Clue {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: 'art' | 'junk';
  dirShow: number | null;
  photo: boolean;
  tFound: number;
  mark: Verdict | null;
  verdict: Verdict | null;
  exp: 'wait' | 'run' | 'done' | null;
  markAtExp?: Verdict | null;
  isNew: boolean;
  paid: boolean;
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

export interface Over {
  win: boolean;
  by: string | null;
  hrs: number;
  mins: number;
  searched: number;
  cluesTotal: number;
  cluesReal: number;
  spent: number;
  strength: number;
  score: number;
}

export interface UiState {
  tab: TabKey;
  sel: Pt | null;
  selUnits: Set<number>;
  dur: number;
  heat: boolean;
  speed: number;
}

export interface LogLine { t: number; txt: string; cls?: string; }

export interface Game {
  t: number;
  funds: number;
  incAcc: number;
  spent: number;
  over: Over | null;
  paused: boolean;
  weather: WeatherKey;
  weatherNext: number;
  nextEvent: number;
  warned: { w60: boolean; w35: boolean; w15: boolean };
  buildings: Record<BuildKey, number>;
  units: Unit[];
  clues: Clue[];
  log: LogLine[];
  nameCnt: Record<UnitType, number>;
  expRuns: { id: number; tEnd: number }[];
  expQueue: number[];
  objId: number;
  clueId: number;
  unitId: number;
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
export interface Campaign {
  buildings: Record<BuildKey, number>;
  roster: RosterEntry[];
  nameCnt: Record<UnitType, number>;
  stats: { won: number; lost: number };
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
