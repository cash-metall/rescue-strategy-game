<script lang="ts">
  import { fx } from '../state/fx.svelte';
</script>

<div class="toasts">
  {#each fx.toasts as t (t.id)}
    <div class="toast" class:good={t.tone === 'good'} class:bad={t.tone === 'bad'}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts { position: fixed; right: 14px; top: 56px; display: flex; flex-direction: column; gap: 6px; z-index: 60; max-width: min(320px, 90vw); pointer-events: none; }
  .toast { background: #20291f; border: 1px solid var(--amber-dim); border-radius: 4px; padding: 8px 12px; font-size: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  .toast.good { border-color: #4c6b3c; }
  .toast.bad { border-color: #8a4038; }
</style>
