<script lang="ts">
  import { game } from '../state/game.svelte';
  import MapCell from './MapCell.svelte';
  import {
    unitPositions, inRange, targetable, isNight, effMark, dirArrow, COLS, W, H,
  } from '../engine';

  const IMG = import.meta.env.BASE_URL + 'images/';
  const XS = [...Array(W).keys()];
  const YS = [...Array(H).keys()];

  const g = $derived(game.g);
  const upos = $derived(unitPositions(g));
  const heat = $derived(game.heat);
  const night = $derived(isNight(g) && !g.over);

  interface Mark { hq?: boolean; lkp?: boolean; victim?: boolean; trail?: boolean; arrows: { cls: string; ch: string }[]; }

  const marks = $derived.by(() => {
    const m = new Map<string, Mark>();
    const get = (k: string): Mark => { let x = m.get(k); if (!x) { x = { arrows: [] }; m.set(k, x); } return x; };
    get(g.hq.x + ',' + g.hq.y).hq = true;
    get(g.lkp.x + ',' + g.lkp.y).lkp = true;
    for (const c of g.clues) {
      const mk = effMark(c);
      const k = c.x + ',' + c.y;
      if (mk === 'real' && c.dirShow != null) get(k).arrows.push({ cls: 'ar', ch: dirArrow(c.dirShow) });
      else if (mk === 'real') get(k).arrows.push({ cls: 'ar', ch: '◎' });
      else if (!mk) get(k).arrows.push({ cls: 'cd', ch: '•' });
    }
    if (g.over) {
      for (const key of g.trailSet) {
        const [x, y] = key.split(',').map(Number);
        if ((x === g.lkp.x && y === g.lkp.y) || (x === g.victim.x && y === g.victim.y)) continue;
        get(key).trail = true;
      }
      get(g.victim.x + ',' + g.victim.y).victim = true;
    }
    return m;
  });

  const canHeat = $derived(g.buildings.carto >= 1);
</script>

<div class="maphdr">
  <span class="lg"><span class="sw" style="background-color:#24402c;background-image:url({IMG}forest.svg)"></span>лес</span>
  <span class="lg"><span class="sw" style="background-color:#152a1c;background-image:url({IMG}dense.svg)"></span>чаща</span>
  <span class="lg"><span class="sw" style="background-color:#4d5a33;background-image:url({IMG}meadow.svg)"></span>поляна</span>
  <span class="lg"><span class="sw" style="background-color:#2e4a44;background-image:url({IMG}marsh.svg)"></span>болото</span>
  <span class="lg"><span class="sw" style="background-color:#4a4438;background-image:url({IMG}hills.svg)"></span>холмы</span>
  <span class="lg"><span class="sw" style="background-color:#1e3a4f"></span>озеро</span>
  <span class="lg"><img src="{IMG}markers/pin.svg" alt="" style="width:12px;height:14px;vertical-align:-2px" /> последний контакт</span>
  <button class="heatbtn" class:on={g.ui.heat} disabled={!canHeat} title={canHeat ? '' : 'Требуется картограф'}
          onclick={() => game.toggleHeat()}>🔥 Вероятность</button>
</div>

<div class="mapwrap">
  <div class="grid" class:night>
    <div class="lbl"></div>
    {#each XS as x (x)}<div class="lbl">{COLS[x]}</div>{/each}
    {#each YS as y (y)}
      <div class="lbl">{y + 1}</div>
      {#each XS as x (x)}
        {@const cell = g.map[y][x]}
        <MapCell
          {cell}
          sel={!!g.ui.sel && g.ui.sel.x === x && g.ui.sel.y === y}
          far={!inRange(g, cell) && targetable(cell)}
          heat={heat ? heat[y][x] : 0}
          units={upos.get(x + ',' + y)}
          mark={marks.get(x + ',' + y)}
          over={!!g.over}
        />
      {/each}
    {/each}
  </div>
</div>

<style>
  .maphdr { display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-bottom: 1px solid var(--line); font-size: 11px; color: var(--mut); flex-wrap: wrap; }
  .lg { display: flex; align-items: center; gap: 4px; }
  .sw { width: 16px; height: 16px; border-radius: 2px; display: inline-block; border: 1px solid rgba(255,255,255,.12); background-position: center; background-repeat: no-repeat; background-size: 13px; }
  .heatbtn { border: 1px solid var(--amber-dim); color: var(--amber); border-radius: 3px; padding: 2px 7px; font-size: 11px; background: #1c2118; }
  .heatbtn:hover:not(:disabled) { background: #2b3322; }
  .heatbtn.on { background: var(--amber); color: #171207; }
  .heatbtn:disabled { opacity: .38; cursor: not-allowed; }

  .mapwrap { overflow: auto; padding: 8px; }
  /* Мобайл: сетка тянется по ширине экрана, клетки квадратные (aspect-ratio на .cell) */
  .grid {
    display: grid; gap: 2px; width: 100%; max-width: 100%;
    grid-template-columns: 18px repeat(12, minmax(0, 1fr));
    grid-template-rows: 18px repeat(12, auto);
    transition: filter 1.2s;
  }
  .grid.night { filter: brightness(.68) saturate(.85); }
  .lbl { display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 10px; color: var(--mut); }
  /* Десктоп: фиксированные 44px клетки */
  @media (min-width: 900px) {
    .mapwrap { padding: 10px; }
    .grid { width: max-content; grid-template-columns: 22px repeat(12, 44px); grid-template-rows: 22px repeat(12, 44px); }
    .lbl { font-size: 11px; }
  }
</style>
