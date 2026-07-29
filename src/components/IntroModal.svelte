<script lang="ts">
  import { game } from '../state/game.svelte';
  import Modal from './Modal.svelte';
  import { coordName, plural, dirName, dirArrow } from '../engine';

  const g = $derived(game.g);
  const p = $derived(g.profile);
  const st = $derived(game.campaign.stats);
  const done = $derived(st.alive + st.dead + st.missing);
  const veteran = $derived(done > 0);
  const caseNo = $derived(done + 1);
  const first = $derived(game.introStart);
  // подсказка о направлении стартового следа
  const startClue = $derived(g.clues.length ? g.clues[g.clues.length - 1] : null);
</script>

<Modal onbackdrop={() => (first ? game.beginCase() : game.closeModal())}>
  <h2>🚨 Вводная · дело №{caseNo}</h2>
  <div class="pcard">
    <div class="face">{p.face}</div>
    <div class="pi">
      <p><b>{p.name}</b>, {p.age} {plural(p.age, 'год', 'года', 'лет')}, {p.who} — {p.story}.</p>
      <p class="mut">Приметы: <span class="hl">{p.color.f} куртка</span>, обувь <span class="hl">{p.size} размера</span>, с собой {p.item}.</p>
      <p class="mut">Точка последнего контакта — квадрат <b class="hl">{coordName(g.lkp.x, g.lkp.y)}</b> (📍 на карте).</p>
    </div>
  </div>
  {#if veteran}
    <p class="mut">🏕️ Штаб и команды с прошлых дел прибыли на новое место в полном составе ({g.units.length} {plural(g.units.length, 'отряд', 'отряда', 'отрядов')}). Бюджет операции — новый.</p>
  {/if}
  <h3>Как вести поиск</h3>
  <ul>
    <li><b>Кликните квадрат</b> на карте → выберите отряды → «Отправить». Группа дойдёт, обследует квадрат целиком и вернётся с находками. Если свободен «Ветер» — подвезёт, и группа не устанет в дороге.</li>
    <li><b>Разбирайте находки</b> во вкладке «Улики»: сверяйте с приметами и решайте — настоящая улика 📌 или мусор 🗑. Новички приносят много лишнего; опытные группы читают направление движения.</li>
    <li><b>Развивайте лагерь</b>: шатёр — больше отрядов, радиостанция — больше групп в поле, дальность и живая передача находок по рации, картограф — экспертиза и карта вероятности, кухня — быстрый отдых, учебный центр — прокачка отрядов.</li>
    <li><b>Учитывайте риск</b>: каждый выход может закончиться происшествием — от севшего фонаря до травмы. Чем опытнее группа, тем реже.</li>
    <li><b>Берегите время</b>: состояние пропавшего ухудшается. Когда медики уедут, дело не закончится — но найти живым будет уже 50/50.</li>
  </ul>
  {#if startClue && startClue.dirShow != null}
    <p class="mut">Подсказка: начните с квадратов рядом с 📍 — стартовый след ведёт {dirName(startClue.dirShow)} {dirArrow(startClue.dirShow)}.</p>
  {/if}
  <div style="text-align:center;margin-top:14px">
    {#if first}
      <button class="btn primary" onclick={() => game.beginCase()}>Начать операцию</button>
    {:else}
      <button class="btn primary" onclick={() => game.closeModal()}>Продолжить</button>
    {/if}
  </div>
</Modal>
