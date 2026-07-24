<script lang="ts">
  import { game } from '../../state/game.svelte';
  import { fmtTimeAt } from '../../engine';

  const g = $derived(game.g);
</script>

{#if !g.log.length}
  <p class="stTxt">Журнал пуст.</p>
{:else}
  {#each g.log as l, i (i)}
    <div class="logline {l.cls || ''}"><span class="lt">{fmtTimeAt(l.t)}</span>{l.txt}</div>
  {/each}
{/if}
