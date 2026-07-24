<script lang="ts">
  import { game } from '../state/game.svelte';
  const g = $derived(game.g);
</script>

<div class="spd">
  <button class="btn" class:on={game.paused} onclick={() => game.pause()} title="Пауза">⏸</button>
  <button class="btn" class:on={!game.paused && g.ui.speed === 1} onclick={() => game.setSpeed(1)}>1×</button>
  <button class="btn" class:on={!game.paused && g.ui.speed === 2} onclick={() => game.setSpeed(2)}>2×</button>
  <button class="btn" class:on={!game.paused && g.ui.speed === 4} onclick={() => game.setSpeed(4)}>4×</button>
  <button class="btn" onclick={() => game.openModal('settings')} title="Штаб и прогресс">⚙</button>
  <button class="btn" onclick={() => game.openHelp()} title="Справка">?</button>
</div>

<style>
  .spd { display: flex; gap: 4px; margin-left: auto; }
  .spd .btn { min-width: 34px; text-align: center; }
</style>
