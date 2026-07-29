import type { Tone } from '../engine';

export interface Toast { id: number; text: string; tone?: Tone; }

// Эфемерный UI: очередь тостов (автогаснут, капятся на 4).
class FxStore {
  toasts = $state<Toast[]>([]);
  private seq = 0;

  push(text: string, tone?: Tone): void {
    const id = ++this.seq;
    this.toasts.push({ id, text, tone });
    while (this.toasts.length > 4) this.toasts.shift();
    setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 5200);
  }
}

export const fx = new FxStore();
