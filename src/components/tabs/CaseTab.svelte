<script lang="ts">
  import { game } from '../../state/game.svelte';
  import { coordName, plural } from '../../engine';

  const p = $derived(game.g.profile);
  const lkp = $derived(game.g.lkp);
</script>

<div class="pcard">
  <div class="face">{p.face}</div>
  <div class="pi">
    <p><b>{p.name}</b>, {p.age} {plural(p.age, 'год', 'года', 'лет')}, {p.who}</p>
    <p class="mut">{p.story[0].toUpperCase() + p.story.slice(1)}.</p>
  </div>
</div>

<div class="secH">Приметы</div>
<div class="card">
  <p>🧥 Куртка: <b class="hl">{p.color.f}</b></p>
  <p>👟 Обувь: ботинки, <b class="hl">{p.size} размер</b></p>
  <p>🎒 С собой: {p.item}</p>
</div>

<div class="secH">Вводная</div>
<div class="card">
  <p>Последний раз {p.name.split(' ')[0]} видели у квадрата <b class="hl">{coordName(lkp.x, lkp.y)}</b> 📍 — там найдены подтверждённые следы.</p>
  <p class="mut">Пропавшие редко ходят по прямой, но следы подскажут направление. Ищите цепочку улик: каждая настоящая находка сужает район поиска.</p>
</div>

<div class="secH">Памятка координатора</div>
<div class="card">
  <p class="mut">• Сверяйте цвет ткани и размер следов с приметами.<br>
    • «Совсем свежие» находки — пропавший недалеко от них.<br>
    • Кинологи на следу ищут лучше всех; дождь им мешает, туман — нет.<br>
    • Дроны сильны над полянами и болотами, слепы в чаще, ночью хуже всем.<br>
    • Уставший отряд ищет вполсилы — давайте людям отдых.</p>
</div>
