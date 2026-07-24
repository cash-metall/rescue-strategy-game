<script lang="ts">
  import { game } from '../state/game.svelte';
  import { TYPES, TERR, coordName, targetable, type Cell, type UnitType } from '../engine';

  const IMG = import.meta.env.BASE_URL + 'images/';

  interface Mark {
    hq?: boolean; lkp?: boolean; victim?: boolean; trail?: boolean;
    arrows: { cls: string; ch: string }[];
  }

  let { cell, sel, far, heat, units, mark, over }: {
    cell: Cell; sel: boolean; far: boolean; heat: number;
    units?: UnitType[]; mark?: Mark; over: boolean;
  } = $props();

  const title = $derived(
    `Кв. ${coordName(cell.x, cell.y)} · ${TERR[cell.terrain].name}` +
    (targetable(cell) ? ` · осмотрено ${Math.round(cell.coverage)}%` : '') +
    (far ? ' · вне радиуса связи' : '')
  );

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); game.select(cell.x, cell.y); }
  }
</script>

<div class="cell t-{cell.terrain}" class:sel class:far {title}
     role="button" tabindex="-1"
     onclick={() => game.select(cell.x, cell.y)} onkeydown={onKey}>
  <span class="ter"></span>
  <div class="heat" style:opacity={heat * 0.5}></div>
  <div class="mk">
    {#if mark?.hq}<img src="{IMG}hq/tent.svg" alt="штаб" />{/if}
    {#if mark?.lkp}<img class="pin pulse" src="{IMG}markers/pin.svg" alt="точка последнего контакта" />{/if}
    {#if over && mark?.trail}<img class="trail" src="{IMG}markers/trail.svg" alt="след" />{/if}
    {#if over && mark?.victim}<img src="{IMG}markers/victim.svg" alt="пропавший" />{/if}
    {#if mark}{#each mark.arrows as a, i (i)}<span class={a.cls}>{a.ch}</span>{/each}{/if}
  </div>
  <div class="uu">
    {#if units}{#each units as t, i (i)}<img src="{IMG}{TYPES[t].svg}" alt={t} />{/each}{/if}
  </div>
  <div class="cv"><i style:width="{cell.coverage}%"></i></div>
</div>
