import { SvelteSet } from 'svelte/reactivity';
import {
  newGame, simMinute, heatScores,
  actSend, actBuild, actHire, actTrain, actRecall, actMark, actExpertise, selectCell,
  actAbandon, actQuest,
  loadCampaign, saveCampaign, resetCampaign,
} from '../engine';
import type { Game, Campaign, KV, Sink, Fx, BuildKey, UnitType, Verdict, Outcome } from '../engine';
import { fx } from './fx.svelte';

const kv: KV = typeof localStorage !== 'undefined' ? localStorage : {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};

function seed(camp: Campaign): Game {
  const g = newGame(camp);
  // selUnits должен быть реактивным для UI-выбора отрядов.
  g.ui.selUnits = new SvelteSet<number>();
  return g;
}

// Модалки — эфемерное состояние UI (пауза при открытии).
export type ModalKind = 'intro' | 'settings' | 'results' | 'quest' | null;

// ── Течение времени ──────────────────────────────────────────────────────────
// Игровое время отвязано от частоты кадров: цикл вызывает tick(dt) каждый кадр,
// накопитель копит игровые минуты по реальному прошедшему времени × timeScale.
// Скорость задаётся ТОЛЬКО множителем timeScale — период кадра ни на что не влияет.
const GAME_MIN_PER_SEC = 2;   // игровых минут в 1 реальную секунду при timeScale = 1
const MAX_FRAME_MS = 250;     // клампим dt: после сворачивания вкладки не гнать пачку минут разом
const MAX_STEPS = 240;        // предохранитель от «спирали смерти» в одном кадре

// Исход дела → категория статистики кампании.
const CAT: Record<Outcome, 'alive' | 'dead' | 'missing'> = {
  alive: 'alive', 'alive-late': 'alive', dead: 'dead', abandoned: 'missing',
};

class GameStore {
  kv: KV = kv;
  campaign = $state<Campaign>(loadCampaign(kv));
  g = $state<Game>(seed(this.campaign));
  paused = $state(true);
  modal = $state<ModalKind>('intro');  // первый брифинг показывается на старте
  introStart = $state(true);           // интро открыто как начало дела (true) или как справка (false)
  sheet = $state<'none' | 'cell' | 'tabs'>('none'); // мобильные bottom-sheet (на десктопе игнорируется)
  resultsFab = $state(false);          // плавающая кнопка «вернуться к итогам»
  timeScale = $state(1);               // множитель скорости: 1× / 2× / 4× (эфемерно, не в сейве)
  private pausedBeforeModal = false;
  private overHandled = false;
  private acc = 0;                     // накопленные игровые минуты (дробные)

  // Реальных миллисекунд на один шаг simMinute при текущей скорости.
  // Нужен рендеру: длительность CSS-перехода движения = шагу, иначе анимация лагает.
  get stepMs(): number { return 1000 / (GAME_MIN_PER_SEC * this.timeScale); }

  heat = $derived(this.g.ui.heat && this.g.buildings.carto >= 1 ? heatScores(this.g) : null);

  private sink: Sink = (f: Fx) => {
    if (f.kind === 'toast') fx.push(f.text, f.tone);
    else if (f.kind === 'save') this.persist();
  };

  private persist(): void {
    this.campaign = saveCampaign(this.kv, this.g, this.campaign.stats);
  }

  /** Вызывается циклом кадров с реальным dt (мс). Копит игровое время и
   *  прокручивает симуляцию фиксированными шагами по одной минуте. */
  tick(dtMs: number): void {
    if (this.paused || this.g.over || this.modal) { this.acc = 0; return; }
    this.acc += (Math.min(dtMs, MAX_FRAME_MS) / 1000) * GAME_MIN_PER_SEC * this.timeScale;
    let steps = 0;
    while (this.acc >= 1 && steps < MAX_STEPS) {
      this.acc -= 1;
      simMinute(this.g, this.sink);
      steps++;
      if (this.g.over || this.g.quest) { this.acc = 0; break; }
    }
    // найден живым после ухода медиков — сначала мини-квест первой помощи
    if (this.g.quest && this.modal !== 'quest') { this.paused = true; this.openModal('quest'); return; }
    if (this.g.over && !this.overHandled) this.onCaseEnd();
  }

  private onCaseEnd(): void {
    this.overHandled = true;
    this.paused = true;
    this.campaign.stats[CAT[this.g.over!.outcome]]++;
    this.persist();
    this.openModal('results');
  }

  // --- управление временем ---
  setSpeed(s: number): void { this.timeScale = s; this.paused = false; }
  pause(): void { this.paused = true; }

  // --- жизненный цикл дела ---
  startCase(): void {
    this.resultsFab = false;
    this.sheet = 'none';
    this.g = seed(this.campaign);
    this.overHandled = false;
    this.paused = true;
    this.introStart = true;
    this.openModal('intro');
  }
  openHelp(): void { this.introStart = false; this.openModal('intro'); }
  hardReset(): void {
    this.campaign = resetCampaign(this.kv);
    this.startCase();
  }

  // --- модалки ---
  openModal(kind: Exclude<ModalKind, null>): void {
    if (this.modal === null) this.pausedBeforeModal = this.paused;
    this.modal = kind;
  }
  closeModal(): void {
    this.modal = null;
    if (!this.g.over) this.paused = this.pausedBeforeModal;
  }
  // «Начать операцию» из интро — снять паузу.
  beginCase(): void { this.modal = null; this.paused = false; this.timeScale = 1; this.acc = 0; }
  showMap(): void { this.modal = null; this.resultsFab = true; }
  backToResults(): void { this.resultsFab = false; this.openModal('results'); }

  // --- действия игрока ---
  send(): void { if (actSend(this.g, this.sink).ok) this.sheet = 'none'; }
  build(key: BuildKey): void { actBuild(this.g, key, this.sink); }
  hire(type: UnitType): void { actHire(this.g, type, this.sink); }
  train(id: number): void { actTrain(this.g, id, this.sink); }
  recall(id: number): void { actRecall(this.g, id, this.sink); }
  mark(id: number, v: Verdict): void { actMark(this.g, id, v, this.sink); }
  expertise(id: number): void { actExpertise(this.g, id, this.sink); }
  select(x: number, y: number): void { selectCell(this.g, x, y, this.sink); this.sheet = 'cell'; }

  /** Свернуть поиски — страховка от софтлока, единственный выход без находки. */
  abandon(): void {
    if (actAbandon(this.g, this.sink).ok && !this.overHandled) this.onCaseEnd();
  }

  /** Ответ в мини-квесте первой помощи. */
  answerQuest(choice: number): void {
    actQuest(this.g, choice, this.sink);
    if (this.g.over) { this.modal = null; if (!this.overHandled) this.onCaseEnd(); }
  }

  // выбор отрядов для отправки
  toggleUnit(id: number, on: boolean): void {
    if (on) this.g.ui.selUnits.add(id); else this.g.ui.selUnits.delete(id);
  }
  setTab(tab: Game['ui']['tab']): void {
    this.g.ui.tab = tab;
    this.sheet = 'tabs';
    if (tab === 'clues') for (const c of this.g.clues) c.isNew = false;
  }
  closeSheet(): void { this.sheet = 'none'; }
  toggleHeat(): void { this.g.ui.heat = !this.g.ui.heat; }
}

export const game = new GameStore();
