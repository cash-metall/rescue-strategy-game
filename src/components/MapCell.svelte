<script lang="ts">
  import { game } from '../state/game.svelte';
  import { TYPES, TERR, coordName, targetable, type Cell, type UnitType } from '../engine';

  const IMG = import.meta.env.BASE_URL + 'images/';

  interface Mark {
    hq?: boolean; lkp?: boolean; victim?: boolean; trail?: boolean;
    sight?: 'human' | 'object';
    arrows: { cls: string; ch: string }[];
  }

  let { cell, far, heat, units, mark, over, zoomed, isSearching }: {
    cell: Cell; far: boolean; heat: number;
    units?: UnitType[]; mark?: Mark; over: boolean; zoomed: boolean;
    isSearching: boolean;
  } = $props();

  // GPS-трек змейкой: 5 горизонтальных проходов (viewBox 100×100)
  // Путь: M6,12 → 94,12 (вправо) → 94,30 (вниз) → 6,30 (влево) → … → 94,84
  // Длина: 5 × 88 + 4 × 18 = 512 ед.
  const TRACK_LEN = 512;
  // Рисуется ОТОБРАЖАЕМОЕ покрытие: при севшем навигаторе трек не появляется,
  // хотя движок помнит, что квадрат уже обследован (docs/incidents.md, gpsDead).
  const trackOffset = $derived(TRACK_LEN * (1 - cell.shown / 100));

  const title = $derived(
    `Кв. ${coordName(cell.x, cell.y)} · ${TERR[cell.terrain].name}` +
    (targetable(cell) ? ` · осмотрено ${Math.round(cell.shown)}%` : '') +
    (mark?.sight ? (mark.sight === 'human' ? ' · возможная цель: человек' : ' · возможная цель на снимке') : '') +
    (far ? ' · вне радиуса связи' : '')
  );

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); game.select(cell.x, cell.y); }
  }
</script>

<div class="cell t-{cell.terrain}" class:far {title}
     role="button" tabindex="-1"
     data-cx={cell.x} data-cy={cell.y}
     onkeydown={onKey}>
  <span class="ter"></span>
  <div class="heat" style:opacity={heat * 0.5}></div>

  {#if cell.shown > 0 || isSearching}
    <!-- GPS-трек: рисуется пропорционально coverage, анимируется при активном поиске -->
    <svg class="track" viewBox="0 0 100 100" aria-hidden="true">
      <path
        class:active={isSearching}
        d="M6,12 L94,12 L94,30 L6,30 L6,48 L94,48 L94,66 L6,66 L6,84 L94,84"
        stroke-dasharray={TRACK_LEN}
        stroke-dashoffset={trackOffset}
      />
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
  <div class="uu">
    {#if units}{#each units as t, i (i)}<img src="{IMG}{TYPES[t].svg}" alt={t} />{/each}{/if}
  </div>
  {#if zoomed}<span class="crd">{coordName(cell.x, cell.y)}</span>{/if}
</div>

<style>
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
    /* пиксельная ширина линии не зависит от масштаба карты */
    vector-effect: non-scaling-stroke;
    transition: stroke-dashoffset 0.35s linear;
  }

  /* Активный поиск: более яркий цвет + пульс */
  .track path.active {
    stroke: rgba(30, 115, 245, 0.85);
    animation: track-pulse 1.8s ease-in-out infinite;
  }

  @keyframes track-pulse {
    0%, 100% { stroke-opacity: 0.65; }
    50%       { stroke-opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .track path        { transition: none; }
    .track path.active { animation: none; }
  }
</style>
