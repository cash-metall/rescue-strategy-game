<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from './state/game.svelte';
  import Header from './components/Header.svelte';
  import MapGrid from './components/MapGrid.svelte';
  import CellSheet from './components/CellSheet.svelte';
  import TabBar from './components/TabBar.svelte';
  import TabPanel from './components/TabPanel.svelte';
  import Toasts from './components/Toasts.svelte';
  import ResultsFab from './components/ResultsFab.svelte';
  import IntroModal from './components/IntroModal.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import ResultsModal from './components/ResultsModal.svelte';

  onMount(() => {
    const id = setInterval(() => game.tick(), 250);
    return () => clearInterval(id);
  });

  const modal = $derived(game.modal);
  const sheetOpen = $derived(game.sheet !== 'none');

</script>

<div class="app">
  <Header />
  <div class="stage">
    <div class="mapcol">
      <MapGrid />
      <div class="cellhost" class:open={game.sheet === 'cell'}><CellSheet /></div>
    </div>
    <div class="side">
      <TabBar />
      <div class="panelhost" class:open={game.sheet === 'tabs'}><TabPanel /></div>
    </div>
    {#if sheetOpen}
      <div class="backdrop" role="button" tabindex="-1" aria-label="Закрыть"
           onclick={() => game.closeSheet()}
           onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') game.closeSheet(); }}></div>
    {/if}
  </div>
</div>

<Toasts />
<ResultsFab />
{#if modal === 'intro'}<IntroModal />{:else if modal === 'settings'}<SettingsModal />{:else if modal === 'results'}<ResultsModal />{/if}

<style>
  /* ===== Мобайл (по умолчанию) ===== */
  .app { height: 100vh; height: 100dvh; width: 100%; max-width: 100vw; display: flex; flex-direction: column; overflow: hidden; }
  .stage { flex: 1; min-height: 0; min-width: 0; position: relative; display: flex; flex-direction: column; overflow: hidden; }
  .mapcol { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; padding-bottom: calc(46px + env(safe-area-inset-bottom)); }
  .mapcol :global(.mapwrap) { flex: 1 1 auto; min-height: 0; }

  .side { display: contents; }
  .side :global(.tabrow) { position: fixed; left: 0; right: 0; bottom: 0; z-index: 48; background: var(--panel); padding-bottom: env(safe-area-inset-bottom); box-shadow: 0 -2px 8px rgba(0,0,0,.4); }

  .panelhost, .cellhost {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 47;
    max-height: 80dvh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--panel); border-top: 1px solid var(--amber-dim); border-radius: 12px 12px 0 0;
    transform: translateY(110%); transition: transform .28s ease;
    padding-bottom: calc(54px + env(safe-area-inset-bottom));
    box-shadow: 0 -8px 24px rgba(0,0,0,.5);
  }
  .panelhost.open, .cellhost.open { transform: translateY(0); }
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 45; }

  /* ===== Десктоп (≥900px): двухколоночная раскладка ===== */
  @media (min-width: 900px) {
    .stage { flex-direction: row; }
    .mapcol { flex: 0 0 auto; border-right: 1px solid var(--line); padding-bottom: 0; }
    .cellhost { position: static; transform: none; max-height: 42vh; border-top: 1px solid var(--line); border-radius: 0; padding-bottom: 0; transition: none; box-shadow: none; background: var(--panel); }
    .side { display: flex; flex-direction: column; flex: 1; min-width: 380px; min-height: 0; }
    .side :global(.tabrow) { position: static; padding-bottom: 0; }
    .panelhost { position: static; transform: none; max-height: none; flex: 1; overflow-y: auto; padding-bottom: 0; transition: none; border-top: none; border-radius: 0; box-shadow: none; }
    .backdrop { display: none; }
  }
</style>
