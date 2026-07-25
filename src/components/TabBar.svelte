<script lang="ts">
  import { game } from '../state/game.svelte';
  import type { TabKey } from '../engine';

  const g = $derived(game.g);
  const newClues = $derived(g.clues.filter(c => c.isNew).length);
  const tabs: { k: TabKey; icon: string; label: string }[] = [
    { k: 'hq',    icon: '⛺', label: 'Штаб'   },
    { k: 'units', icon: '🥾', label: 'Отряды' },
    { k: 'clues', icon: '🔍', label: 'Улики'  },
    { k: 'case',  icon: '📋', label: 'Дело'   },
    { k: 'log',   icon: '📡', label: 'Журнал' },
  ];
</script>

<nav class="tabrow">
  {#each tabs as t (t.k)}
    <button class="tabbtn"
            class:on={g.ui.tab === t.k && game.sheet === 'tabs'}
            onclick={() => g.ui.tab === t.k && game.sheet === 'tabs' ? game.closeSheet() : game.setTab(t.k)}>
      <span class="ico">
        {t.icon}
        {#if t.k === 'clues' && newClues}<span class="bdg">{newClues}</span>{/if}
      </span>
      <span class="lbl">{t.label}</span>
    </button>
  {/each}
</nav>
