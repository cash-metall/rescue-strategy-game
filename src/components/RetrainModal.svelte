<script lang="ts">
  import { game } from '../state/game.svelte';
  import { TYPES, type UnitType } from '../engine';
  import Icon from './Icon.svelte';

  const g = $derived(game.g);
  const u = $derived(g.units.find(x => x.id === game.retrainId) ?? null);
  const others = $derived(
    (Object.keys(TYPES) as UnitType[]).filter(t => !u || t !== u.type),
  );

  let box: HTMLDivElement | undefined = $state();
  $effect(() => { box?.focus(); });

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') game.closeRetrain();
  }
</script>

<svelte:window onkeydown={key} />

{#if u}
<div class="wrap" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) game.closeRetrain(); }}>
  <div class="retrainbox" bind:this={box} role="dialog" aria-modal="true" tabindex="-1">
    <h2>На какую специализацию переобучить {u.name}?</h2>
    <p class="msg">Отряд завершит дела и покинет текущий поиск. В следующем деле вернётся <b>новым бойцом
      1-го уровня</b> с новым позывным — прежний уровень и обучение теряются.</p>
    <div class="opts">
      {#each others as t (t)}
        {@const locked = g.buildings.tent < TYPES[t].unlock}
        {@const poor = g.funds < TYPES[t].cost}
        <button class="opt" disabled={locked || poor} onclick={() => game.retrain(t)}>
          <Icon src={TYPES[t].svg} size={22} />
          <span class="nm">{TYPES[t].name}</span>
          <span class="cost">{#if locked}🔒 нужен штаб ур. {TYPES[t].unlock}{:else}{TYPES[t].cost} ₽{/if}</span>
        </button>
      {/each}
    </div>
    <div class="actions">
      <button class="btn" onclick={() => game.closeRetrain()}>Отмена</button>
    </div>
  </div>
</div>
{/if}

<style>
  .wrap { position: fixed; inset: 0; background: rgba(5,8,6,.72); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 12px; }
  .retrainbox { background: var(--panel); border: 1px solid var(--amber-dim); border-radius: 6px; max-width: 460px; width: 100%; padding: 20px 24px; box-shadow: 0 10px 40px rgba(0,0,0,.7); outline: none; }
  .retrainbox h2 { font-size: 15px; color: var(--txt); margin: 0 0 10px; }
  .msg { color: var(--mut); font-size: 13px; line-height: 1.5; margin: 0 0 14px; }
  .opts { display: flex; flex-direction: column; gap: 8px; }
  .opt { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--amber-dim); border-radius: 4px; background: #1c2118; color: var(--amber); text-align: left; transition: background .15s; }
  .opt:hover:not(:disabled) { background: #2b3322; }
  .opt:disabled { opacity: .4; cursor: not-allowed; }
  .opt .nm { flex: 1; color: var(--txt); font-size: 13px; }
  .opt .cost { font-family: var(--mono); font-size: 12px; }
  .actions { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
