<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children, onbackdrop }: { children: Snippet; onbackdrop?: () => void } = $props();

  let box: HTMLDivElement | undefined = $state();
  $effect(() => { box?.focus(); });
</script>

<div class="wrap" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onbackdrop?.(); }}>
  <div class="modalbox box" bind:this={box} role="dialog" aria-modal="true" tabindex="-1">
    {@render children()}
  </div>
</div>

<style>
  .wrap { position: fixed; inset: 0; background: rgba(5,8,6,.72); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 12px; }
  .box { background: var(--panel); border: 1px solid var(--amber-dim); border-radius: 6px; max-width: 600px; width: 100%; max-height: 88vh; max-height: 88dvh; overflow-y: auto; padding: 20px 24px; box-shadow: 0 10px 40px rgba(0,0,0,.7); outline: none; }
</style>
