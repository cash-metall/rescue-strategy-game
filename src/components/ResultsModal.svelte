<script lang="ts">
  import { game } from '../state/game.svelte';
  import Modal from './Modal.svelte';
  import { coordName } from '../engine';

  const g = $derived(game.g);
  const o = $derived(g.over!);
  const p = $derived(g.profile);
  const st = $derived(game.campaign.stats);

  function reset() {
    if (confirm('Сбросить весь прогресс штаба и команд? Это необратимо.')) game.hardReset();
  }
</script>

<Modal>
  {#if o.outcome === 'alive'}
    <h2>🎉 Найден жив!</h2>
    <p>{p.face} <b>{p.name}</b> {p.gen === 'f' ? 'найдена живой и передана' : 'найден живым и передан'} медикам.</p>
    <p class="mut">Квадрат {coordName(g.victim.x, g.victim.y)}. Нашёл отряд: {o.by}. Нажмите «Осмотреть карту», чтобы увидеть весь путь пропавшего 👣.</p>
  {:else if o.outcome === 'alive-late'}
    <h2>🩹 Найден жив — но поздно</h2>
    <p>Медики уже уехали, и {p.face} <b>{p.name}</b> {p.gen === 'f' ? 'вытаскивали' : 'вытаскивали'} своими силами. {p.gen === 'f' ? 'Жива' : 'Жив'}.</p>
    <p class="mut">Квадрат {coordName(g.victim.x, g.victim.y)}. Нашёл отряд: {o.by}. Верных решений при оказании помощи: {o.questCorrect ?? 0} из 3.</p>
  {:else if o.outcome === 'dead'}
    <h2>🕯️ Найден, погиб</h2>
    <p>{p.face} <b>{p.name}</b> {p.gen === 'f' ? 'найдена' : 'найден'} в квадрате {coordName(g.victim.x, g.victim.y)}. Помощь пришла слишком поздно.</p>
    <p class="mut">Это не победа, но и не пустота: человека нашли, семья знает правду. В следующий раз действуйте быстрее — стройте штаб, подтверждайте улики и сужайте район.</p>
  {:else}
    <h2>✖ Поиски свёрнуты</h2>
    <p>Операция прекращена. {p.face} <b>{p.name}</b> так и {p.gen === 'f' ? 'осталась' : 'остался'} ненайденным.</p>
    <p class="mut">Нажмите «Осмотреть карту», чтобы увидеть, где {p.gen === 'f' ? 'она была' : 'он был'} 👣.</p>
  {/if}

  <h3>Итоги операции</h3>
  <div class="endstat"><span>Длительность поисков</span><b>{o.hrs} ч {o.mins} мин</b></div>
  <div class="endstat"><span>Осмотрено квадратов</span><b>{o.searched}</b></div>
  <div class="endstat"><span>Собрано находок</span><b>{o.cluesTotal}</b></div>
  <div class="endstat"><span>Подтверждено настоящих</span><b>{o.cluesReal}</b></div>
  <div class="endstat"><span>Потрачено средств</span><b>{o.spent} ₽</b></div>
  {#if o.outcome === 'alive'}
    <div class="endstat"><span>Состояние спасённого</span><b>{Math.round(o.strength)}%</b></div>
  {/if}
  {#if o.score > 0}
    <div class="endstat"><span>Счёт</span><b>{o.score}</b></div>
  {/if}

  <h3>Хроника поисков</h3>
  <div class="endstat"><span>✅ Найдены живыми</span><b>{st.alive}</b></div>
  <div class="endstat"><span>🕯️ Найдены погибшими</span><b>{st.dead}</b></div>
  <div class="endstat"><span>✖ Не найдены</span><b>{st.missing}</b></div>
  <p class="mut" style="margin-top:10px">Штаб и команды (с их уровнями обучения) переходят в следующее дело — опыт накапливается.</p>

  <div style="text-align:center;margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
    <button class="btn" onclick={() => game.showMap()}>🗺 Осмотреть карту</button>
    <button class="btn primary" onclick={() => game.startCase()}>Следующее дело →</button>
    <button class="btn danger" onclick={reset}>Сбросить прогресс</button>
  </div>
</Modal>
