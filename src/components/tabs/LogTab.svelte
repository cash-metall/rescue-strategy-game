<script lang="ts">
  import { game } from '../../state/game.svelte';
  import { fmtTimeAt } from '../../engine';

  const g = $derived(game.g);
  // «Только важное» прячет рутинные статусы отрядов (выехал/осмотр/вернулся),
  // оставляя события и предупреждения. Состояние живёт в g.ui — переживает смену вкладок.
  const lines = $derived(g.ui.logImportant ? g.log.filter(l => !l.routine) : g.log);
</script>

<label class="logfilter">
  <input type="checkbox" bind:checked={g.ui.logImportant} />
  Только важное
</label>

{#if !lines.length}
  <p class="stTxt">{g.ui.logImportant && g.log.length ? 'Важных событий пока нет.' : 'Журнал пуст.'}</p>
{:else}
  {#each lines as l (l)}
    <div class="logline {l.cls || ''}"><span class="lt">{fmtTimeAt(l.t)}</span>{l.txt}</div>
  {/each}
{/if}

<style>
  .logfilter {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--mut);
    padding: 2px 2px 8px; cursor: pointer; user-select: none;
  }
  .logfilter input { cursor: pointer; }
</style>
