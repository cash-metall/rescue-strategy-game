<script lang="ts">
  import { game } from '../state/game.svelte';
  import { TERR, coordName, targetable, type Cell } from '../engine';

  const IMG = import.meta.env.BASE_URL + 'images/';

  interface Mark {
    hq?: boolean; lkp?: boolean; victim?: boolean; trail?: boolean;
    sight?: 'human' | 'object';
    arrows: { cls: string; ch: string }[];
  }

  let { cell, far, heat, mark, over, zoomed, live }: {
    cell: Cell; far: boolean; heat: number;
    mark?: Mark; over: boolean; zoomed: boolean;
    /** Прогресс прохода, который идёт в квадрате ПРЯМО СЕЙЧАС, 0..100 (0 — никто не работает). */
    live: number;
  } = $props();

  // GPS-трек змейкой: 5 горизонтальных проходов (viewBox 100×100)
  // M6,12 → 94,12 (вправо) → 94,30 (вниз) → 6,30 (влево) → … → 94,84
  const TRACK: [number, number][] = [
    [6, 12], [94, 12], [94, 30], [6, 30], [6, 48], [94, 48], [94, 66], [6, 66], [6, 84], [94, 84],
  ];
  const TRACK_LEN = 512;   // 5 × 88 + 4 × 18 — сумма осевых сегментов выше

  /**
   * Путь, прорисованный на `pct` процентов; '' — рисовать нечего.
   *
   * Именно путь, а НЕ `stroke-dashoffset`: при `vector-effect: non-scaling-stroke` браузер
   * считает штрих (и вместе с ним `dasharray`) в экранных пикселях, а не в единицах viewBox.
   * Длина этой змейки на экране — `512 × 46/100 × зум`, поэтому «залить N% пути» дэшем
   * невозможно: доля заливки зависела бы от зума карты. Проверено в Chrome — при зуме 0.5
   * трек добегал до конца на 50% покрытия и дальше стоял (docs/devlog.md).
   */
  function trackPath(pct: number): string {
    if (!(pct > 0)) return '';
    let left = TRACK_LEN * Math.min(100, pct) / 100;
    let d = `M${TRACK[0][0]},${TRACK[0][1]}`;
    for (let i = 1; i < TRACK.length && left > 0; i++) {
      const [ax, ay] = TRACK[i - 1], [bx, by] = TRACK[i];
      const len = Math.abs(bx - ax) + Math.abs(by - ay);      // сегменты только осевые
      if (left >= len) { d += ` L${bx},${by}`; left -= len; continue; }
      const k = left / len;
      d += ` L${(ax + (bx - ax) * k).toFixed(2)},${(ay + (by - ay) * k).toFixed(2)}`;
      left = 0;
    }
    return d;
  }

  // Два слоя. Тусклый — ОТОБРАЖАЕМОЕ покрытие клетки (при севшем навигаторе не растёт, хотя
  // движок покрытие помнит — docs/incidents.md, gpsDead). Яркий — проход, который идёт сейчас:
  // он стартует с нуля на каждом визите и потому дорисовывается ровно тогда, когда группа
  // заканчивает осмотр. Через `cell.shown` этого не выразить: там максимум по всем визитам.
  const seenD = $derived(trackPath(cell.shown));
  const liveD = $derived(trackPath(live));

  // Туман войны: до картографа ур. 1 нераскрытые клетки скрыты (тип неизвестен).
  const fog = $derived(game.g.buildings.carto === 0 && !cell.revealed);

  const title = $derived(fog
    ? `Кв. ${coordName(cell.x, cell.y)} · местность неизвестна`
    : `Кв. ${coordName(cell.x, cell.y)} · ${TERR[cell.terrain].name}` +
      (targetable(cell) ? ` · осмотрено ${Math.round(cell.shown)}%` : '') +
      (mark?.sight ? (mark.sight === 'human' ? ' · возможная цель: человек' : ' · возможная цель на снимке') : '') +
      (far ? ' · вне радиуса связи' : '')
  );

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); game.select(cell.x, cell.y); }
  }
</script>

<div class="cell t-{cell.terrain}" class:far class:fog {title}
     role="button" tabindex="-1"
     data-cx={cell.x} data-cy={cell.y}
     onkeydown={onKey}>
  {#if fog}
    <span class="fogq" aria-hidden="true">?</span>
  {:else}
    <span class="ter"></span>
    <div class="heat" style:opacity={heat * 0.5}></div>
  {/if}

  {#if seenD || liveD}
    <!-- GPS-трек: тусклый — что уже обследовано, яркий — текущий проход -->
    <svg class="track" viewBox="0 0 100 100" aria-hidden="true">
      {#if seenD}<path class="seen" d={seenD} />{/if}
      {#if liveD}<path class="live" d={liveD} />{/if}
    </svg>
  {/if}

  <div class="mk">
    {#if mark?.hq}<img src="{IMG}hq/tent.svg" alt="штаб" />{/if}
    {#if mark?.lkp}<img class="pin pulse" src="{IMG}markers/pin.svg" alt="точка последнего контакта" />{/if}
    {#if over && mark?.trail}<img class="trail" src="{IMG}markers/trail.svg" alt="след" />{/if}
    {#if over && mark?.victim}<img src="{IMG}markers/victim.svg" alt="пропавший" />{/if}
    {#if mark?.sight}<span class="sight" class:hum={mark.sight === 'human'}>{mark.sight === 'human' ? '🚨' : '❓'}</span>{/if}
    {#if mark}{#each mark.arrows as a, i (i)}<span class={a.cls}>{a.ch}</span>{/each}{/if}
  </div>
  {#if zoomed}<span class="crd">{coordName(cell.x, cell.y)}</span>{/if}
</div>

<style>
  /* Туман войны: серый квадрат с серым «?», топознак и цвет местности скрыты */
  .cell.fog { background: #b7b3a8 !important; }
  .fogq {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #8f8b80; font-weight: 700; font-size: 22px; line-height: 1;
  }

  /* Наводка «возможная цель» — маркер коптера/телефонного звонка, не улика */
  .sight { font-size: 13px; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .55)); }
  .sight.hum { animation: sight-pulse 1.6s ease-in-out infinite; }

  @keyframes sight-pulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.22); }
  }

  @media (prefers-reduced-motion: reduce) {
    .sight.hum { animation: none; }
  }

  /* GPS-трек змейкой — абсолютный SVG-слой поверх фона, под маркерами */
  .track {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .track path {
    fill: none;
    stroke: rgba(30, 100, 220, 0.52);
    stroke-width: 2px;
    stroke-linecap: round;
    stroke-linejoin: round;
    /* пиксельная ширина линии не зависит от масштаба карты. ВНИМАНИЕ: из-за этого штрих
       считается в экранных пикселях — dash-заливку по проценту сюда возвращать нельзя,
       длину прорисованной части задаёт сам `d` (см. trackPath). */
    vector-effect: non-scaling-stroke;
    /* Перехода нет: `d` пересчитывается каждый кадр по game.tNow, как и позиции отрядов. */
  }

  /* Идущий прямо сейчас проход: ярче + пульс */
  .track path.live {
    stroke: rgba(30, 115, 245, 0.85);
    animation: track-pulse 1.8s ease-in-out infinite;
  }

  @keyframes track-pulse {
    0%, 100% { stroke-opacity: 0.65; }
    50%       { stroke-opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .track path.live { animation: none; }
  }
</style>
