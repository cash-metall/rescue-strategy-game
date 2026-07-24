import { SvelteSet } from 'svelte/reactivity';
import {
  newGame, simMinute, heatScores,
  actSend, actBuild, actHire, actTrain, actRecall, actMark, actExpertise, selectCell,
  loadCampaign, saveCampaign, resetCampaign,
} from '../engine';
import type { Game, Campaign, KV, Sink, Fx, BuildKey, UnitType, Verdict } from '../engine';
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
export type ModalKind = 'intro' | 'settings' | 'results' | null;

class GameStore {
  kv: KV = kv;
  campaign = $state<Campaign>(loadCampaign(kv));
  g = $state<Game>(seed(this.campaign));
  paused = $state(true);
  modal = $state<ModalKind>('intro');  // первый брифинг показывается на старте
  introStart = $state(true);           // интро открыто как начало дела (true) или как справка (false)
  sheet = $state<'none' | 'cell' | 'tabs'>('none'); // мобильные bottom-sheet (на десктопе игнорируется)
  resultsFab = $state(false);          // плавающая кнопка «вернуться к итогам»
  private pausedBeforeModal = false;
  private overHandled = false;

  heat = $derived(this.g.ui.heat && this.g.buildings.carto >= 1 ? heatScores(this.g) : null);

  private sink: Sink = (f: Fx) => {
    if (f.kind === 'toast') fx.push(f.text, f.tone);
    else if (f.kind === 'save') this.persist();
  };

  private persist(): void {
    this.campaign = saveCampaign(this.kv, this.g, this.campaign.stats);
  }

  tick(): void {
    if (this.paused || this.g.over || this.modal) return;
    const speed = this.g.ui.speed;
    for (let i = 0; i < speed; i++) {
      simMinute(this.g, this.sink);
      if (this.g.over) break;
    }
    if (this.g.over && !this.overHandled) this.onCaseEnd();
  }

  private onCaseEnd(): void {
    this.overHandled = true;
    this.paused = true;
    this.campaign.stats[this.g.over!.win ? 'won' : 'lost']++;
    this.persist();
    this.openModal('results');
  }

  // --- управление временем ---
  setSpeed(s: number): void { this.g.ui.speed = s; this.paused = false; }
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
  beginCase(): void { this.modal = null; this.paused = false; this.g.ui.speed = 1; }
  showMap(): void { this.modal = null; this.resultsFab = true; }
  backToResults(): void { this.resultsFab = false; this.openModal('results'); }

  // --- действия игрока ---
  send(): void { actSend(this.g, this.sink); }
  build(key: BuildKey): void { actBuild(this.g, key, this.sink); }
  hire(type: UnitType): void { actHire(this.g, type, this.sink); }
  train(id: number): void { actTrain(this.g, id, this.sink); }
  recall(id: number): void { actRecall(this.g, id, this.sink); }
  mark(id: number, v: Verdict): void { actMark(this.g, id, v, this.sink); }
  expertise(id: number): void { actExpertise(this.g, id, this.sink); }
  select(x: number, y: number): void { selectCell(this.g, x, y, this.sink); this.sheet = 'cell'; }

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
  setDur(d: number): void { this.g.ui.dur = d; }
  toggleHeat(): void { this.g.ui.heat = !this.g.ui.heat; }
}

export const game = new GameStore();
