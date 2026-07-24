<script lang="ts">
  import { game } from '../state/game.svelte';
  import Modal from './Modal.svelte';
  import { coordName } from '../engine';

  const g = $derived(game.g);
  const o = $derived(g.over!);
  const p = $derived(g.profile);

  function reset() {
    if (confirm('Сбросить весь прогресс штаба и команд? Это необратимо.')) game.hardReset();
  }
</script>

<Modal>
  {#if o.win}
    <h2>🎉 Пострадавший найден!</h2>
    <p>{p.face} <b>{p.name}</b> {p.gen === 'f' ? 'найдена живой и передана' : 'найден живым и передан'} медикам.</p>
    <p class="mut">Квадрат {coordName(g.victim.x, g.victim.y)}. Нашёл отряд: {o.by}. Нажмите «Осмотреть карту», чтобы увидеть весь путь пропавшего 👣.</p>
  {:else}
    <h2>🕯️ Поиски завершены</h2>
    <p>Помощь пришла слишком поздно. {p.face} <b>{p.name}</b> не {p.gen === 'f' ? 'дожила' : 'дожил'} до прибытия спасателей.</p>
    <p class="mut">Нажмите «Осмотреть карту», чтобы увидеть его путь 👣. В следующий раз действуйте быстрее: стройте штаб, подтверждайте улики и сужайте район поиска.</p>
  {/if}

  <h3>Итоги операции</h3>
  <div class="endstat"><span>Длительность поисков</span><b>{o.hrs} ч {o.mins} мин</b></div>
  <div class="endstat"><span>Осмотрено квадратов</span><b>{o.searched}</b></div>
  <div class="endstat"><span>Собрано улик</span><b>{o.cluesTotal}</b></div>
  <div class="endstat"><span>Подтверждено настоящих</span><b>{o.cluesReal}</b></div>
  <div class="endstat"><span>Потрачено средств</span><b>{o.spent} ₽</b></div>
  {#if o.win}
    <div class="endstat"><span>Состояние спасённого</span><b>{Math.round(o.strength)}%</b></div>
    <div class="endstat"><span>Счёт</span><b>{o.score}</b></div>
  {/if}

  <h3>Хроника поисков</h3>
  <div class="endstat"><span>✅ Спасено человек</span><b>{game.campaign.stats.won}</b></div>
  <div class="endstat"><span>🕯️ Не успели</span><b>{game.campaign.stats.lost}</b></div>
  <p class="mut" style="margin-top:10px">Штаб и команды (с их уровнями обучения) переходят в следующее дело — опыт накапливается.</p>

  <div style="text-align:center;margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
    <button class="btn" onclick={() => game.showMap()}>🗺 Осмотреть карту</button>
    <button class="btn primary" onclick={() => game.startCase()}>Следующее дело →</button>
    <button class="btn danger" onclick={reset}>Сбросить прогресс</button>
  </div>
</Modal>
