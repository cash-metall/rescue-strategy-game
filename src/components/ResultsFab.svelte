<script lang="ts">
  import { game } from '../state/game.svelte';
</script>

{#if game.resultsFab}
  <button class="btn primary fab" onclick={() => game.backToResults()}>📋 Вернуться к итогам</button>
{/if}

<style>
  .fab { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 70; box-shadow: 0 6px 20px rgba(0,0,0,.55); }
</style>
