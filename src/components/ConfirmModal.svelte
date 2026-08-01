<script lang="ts">
  import { game } from '../state/game.svelte';

  const req = $derived(game.confirmReq!);
  let box: HTMLDivElement | undefined = $state();
  $effect(() => { box?.focus(); });

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') game.resolveConfirm(false);
  }
</script>

<svelte:window onkeydown={key} />

<div class="wrap" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) game.resolveConfirm(false); }}>
  <div class="confirmbox" bind:this={box} role="alertdialog" aria-modal="true" tabindex="-1">
    <h2 class:danger={req.danger}>{req.title}</h2>
    <p class="msg">{req.message}</p>
    <div class="actions">
      <button class="btn" onclick={() => game.resolveConfirm(false)}>Отмена</button>
      <button class="btn" class:danger={req.danger} class:primary={!req.danger} onclick={() => game.resolveConfirm(true)}>
        {req.confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .wrap { position: fixed; inset: 0; background: rgba(5,8,6,.72); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 12px; }
  .confirmbox { background: var(--panel); border: 1px solid var(--amber-dim); border-radius: 6px; max-width: 440px; width: 100%; padding: 20px 24px; box-shadow: 0 10px 40px rgba(0,0,0,.7); outline: none; }
  .confirmbox h2 { font-size: 15px; color: var(--txt); margin: 0 0 10px; }
  .confirmbox h2.danger { color: #e08074; }
  .msg { color: var(--mut); font-size: 13px; line-height: 1.5; white-space: pre-line; margin: 0; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 18px; }
</style>
