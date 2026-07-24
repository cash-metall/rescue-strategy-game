<script lang="ts">
  import { game } from '../state/game.svelte';
  import type { TabKey } from '../engine';

  const g = $derived(game.g);
  const newClues = $derived(g.clues.filter(c => c.isNew).length);
  const tabs: { k: TabKey; label: string }[] = [
    { k: 'hq', label: '⛺ Штаб' },
    { k: 'units', label: '🥾 Отряды' },
    { k: 'clues', label: '🔍 Улики' },
    { k: 'case', label: '📋 Дело' },
    { k: 'log', label: '📡 Журнал' },
  ];
</script>

<nav class="tabrow">
  {#each tabs as t (t.k)}
    <button class="tabbtn" class:on={g.ui.tab === t.k} onclick={() => game.setTab(t.k)}>
      {t.label}{#if t.k === 'clues' && newClues}<span class="bdg">{newClues}</span>{/if}
    </button>
  {/each}
</nav>
