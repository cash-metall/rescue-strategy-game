<script lang="ts">
  import { game } from '../state/game.svelte';
  import HQTab from './tabs/HQTab.svelte';
  import UnitsTab from './tabs/UnitsTab.svelte';
  import CluesTab from './tabs/CluesTab.svelte';
  import CaseTab from './tabs/CaseTab.svelte';
  import LogTab from './tabs/LogTab.svelte';

  const tab = $derived(game.g.ui.tab);
</script>

<div class="tabbody">
  {#if tab === 'hq'}<HQTab />
  {:else if tab === 'units'}<UnitsTab />
  {:else if tab === 'clues'}<CluesTab />
  {:else if tab === 'case'}<CaseTab />
  {:else}<LogTab />{/if}
</div>

<style>
  .tabbody { flex: 1; overflow-y: auto; padding: 10px; }
</style>
