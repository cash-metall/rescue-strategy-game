<script lang="ts">
  import { game } from '../state/game.svelte';
  import Modal from './Modal.svelte';
  import { BUILD, TYPES, type BuildKey } from '../engine';

  const g = $derived(game.g);
  const buildKeys = Object.keys(BUILD) as BuildKey[];

  function reset() {
    if (confirm('Сбросить весь прогресс штаба и команд? Это необратимо.')) game.hardReset();
  }
</script>

<Modal onbackdrop={() => game.closeModal()}>
  <h2>⚙ Штаб и прогресс</h2>
  <div class="secH">Хроника</div>
  <div class="endstat"><span>✅ Спасено человек</span><b>{game.campaign.stats.won}</b></div>
  <div class="endstat"><span>🕯️ Не успели</span><b>{game.campaign.stats.lost}</b></div>

  <div class="secH">Развитие штаба (сохраняется между делами)</div>
  <p class="mut">
    {#each buildKeys as k (k)}
      {BUILD[k].icon} {BUILD[k].name.toLowerCase()} — ур. {g.buildings[k]}/{BUILD[k].max}<br />
    {/each}
  </p>

  <div class="secH">Состав команд</div>
  <p class="mut">
    {#each g.units as u (u.id)}
      {TYPES[u.type].icon} {u.name} ({'★'.repeat(u.level)})<br />
    {/each}
  </p>

  <div class="secH">Управление</div>
  <p class="mut">Прогресс хранится в этом браузере. «Новая игра» полностью обнулит штаб и команды и начнёт первое дело заново.</p>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
    <button class="btn primary" onclick={() => game.closeModal()}>Закрыть</button>
    <button class="btn danger" onclick={reset}>Новая игра (сбросить прогресс)</button>
  </div>
</Modal>
