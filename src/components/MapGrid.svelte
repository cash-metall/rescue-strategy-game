<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from '../state/game.svelte';
  import MapCell from './MapCell.svelte';
  import {
    unitPositions, inRange, targetable, effMark, dirArrow, COLS, W, H,
  } from '../engine';

  const XS = [...Array(W).keys()];
  const YS = [...Array(H).keys()];

  const g = $derived(game.g);
  const upos = $derived(unitPositions(g));
  const heat = $derived(game.heat);

  interface Mark { hq?: boolean; lkp?: boolean; victim?: boolean; trail?: boolean; arrows: { cls: string; ch: string }[]; }

  const marks = $derived.by(() => {
    const m = new Map<string, Mark>();
    const get = (k: string): Mark => { let v = m.get(k); if (!v) { v = { arrows: [] }; m.set(k, v); } return v; };
    get(`${g.hq.x},${g.hq.y}`).hq = true;
    get(`${g.lkp.x},${g.lkp.y}`).lkp = true;
    for (const c of g.clues) {
      const mk = effMark(c);
      const k = `${c.x},${c.y}`;
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
      get(`${g.victim.x},${g.victim.y}`).victim = true;
    }
    return m;
  });

  // ── Pan / Zoom ──────────────────────────────────────────────────────────────
  let scale = $state(1);
  let tx    = $state(0);
  let ty    = $state(0);
  const zoomed = $derived(scale > 1.5);

  let wrapEl: HTMLElement;
  let gridEl: HTMLElement;

  /** Применить зум вокруг точки (cx, cy) в координатах wrapEl */
  function applyZoom(newScale: number, cx: number, cy: number) {
    newScale = Math.min(6, Math.max(0.28, newScale));
    const ratio = newScale / scale;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    scale = newScale;
  }

  function resetView() {
    if (!wrapEl || !gridEl) return;
    const wr = wrapEl.getBoundingClientRect();
    const gw = gridEl.offsetWidth;
    const gh = gridEl.offsetHeight;
    const s  = Math.min(wr.width / gw, wr.height / gh) * 0.96;
    scale = s;
    tx = (wr.width  - gw * s) / 2;
    ty = (wr.height - gh * s) / 2;
  }

  onMount(() => { resetView(); });

  // ── Мышь / тач: перетаскивание ─────────────────────────────────────────────
  let dragging = false;
  let didDrag  = false;
  let dragPx = 0, dragPy = 0, dragTx = 0, dragTy = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    dragging = true; didDrag = false;
    dragPx = e.clientX; dragPy = e.clientY;
    dragTx = tx;        dragTy = ty;
    wrapEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - dragPx;
    const dy = e.clientY - dragPy;
    if (!didDrag && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) didDrag = true;
    if (didDrag) { tx = dragTx + dx; ty = dragTy + dy; }
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    if (didDrag) {
      // Блокируем клик, который браузер выстрелит после drag
      wrapEl.addEventListener('click', (e) => e.stopPropagation(), { once: true, capture: true });
    }
  }

  // ── Touch pinch (passive:false нужен для preventDefault) ───────────────────
  let pinching = false;
  let pinchD = 0, pinchMx = 0, pinchMy = 0;

  $effect(() => {
    if (!wrapEl) return;
    const el = wrapEl;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      applyZoom(scale * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX - r.left, e.clientY - r.top);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinching = true; dragging = false;
        const t = e.touches;
        const r = el.getBoundingClientRect();
        pinchD  = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        pinchMx = (t[0].clientX + t[1].clientX) / 2 - r.left;
        pinchMy = (t[0].clientY + t[1].clientY) / 2 - r.top;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinching) {
        e.preventDefault();
        const t = e.touches;
        const r  = el.getBoundingClientRect();
        const d  = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        const mx = (t[0].clientX + t[1].clientX) / 2 - r.left;
        const my = (t[0].clientY + t[1].clientY) / 2 - r.top;
        // Зум вокруг старого центра, затем сдвиг к новому
        applyZoom(scale * (d / pinchD), pinchMx, pinchMy);
        tx += mx - pinchMx;
        ty += my - pinchMy;
        pinchD = d; pinchMx = mx; pinchMy = my;
      }
    };

    const onTouchEnd = () => { pinching = false; };

    el.addEventListener('wheel',      onWheel,      { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd);

    return () => {
      el.removeEventListener('wheel',      onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  });
</script>

<!-- ── Карта с пан/зум ────────────────────────────────────────────────────── -->
<div class="mapwrap" bind:this={wrapEl}
     onpointerdown={onPointerDown}
     onpointermove={onPointerMove}
     onpointerup={onPointerUp}>
  <!-- Кнопка сброса зума — floating, не мешает карте -->
  <button class="resetbtn" onclick={resetView} title="Вписать карту в экран">⊞</button>
  <div class="gridwrap" style:transform="translate({tx}px,{ty}px) scale({scale})">
    <div class="grid" class:zoomed bind:this={gridEl}>
      <div class="lbl"></div>
      {#each XS as x (x)}<div class="lbl col">{COLS[x]}</div>{/each}
      {#each YS as y (y)}
        <div class="lbl row">{y + 1}</div>
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
</div>

<style>
  /* ── Кнопка сброса зума (floating, правый нижний угол) ── */
  .resetbtn {
    position: absolute; bottom: 10px; right: 10px; z-index: 10;
    width: 34px; height: 34px;
    background: rgba(10, 18, 12, 0.72);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
    color: rgba(220, 235, 220, 0.85); font-size: 16px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s;
    pointer-events: all;
  }
  .resetbtn:hover { background: rgba(20, 35, 22, 0.88); color: #fff; }

  /* ── Viewport (светлая бумага) ── */
  .mapwrap {
    flex: 1; overflow: hidden; position: relative;
    touch-action: none; cursor: grab;
    background: #e6ddc8;            /* цвет "бумаги" видно по краям */
    -webkit-user-select: none; user-select: none;
  }
  .mapwrap:active { cursor: grabbing; }

  /* ── Трансформируемый контейнер ── */
  .gridwrap {
    position: absolute; top: 0; left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  /* ── Сетка (красные линии = background через gap) ── */
  .grid {
    display: grid;
    gap: 2px;
    width: max-content;
    grid-template-columns: 22px repeat(12, 46px);
    grid-template-rows: 22px repeat(12, 46px);
    background: rgba(172, 22, 22, 0.55);   /* красная сетка */
    padding: 2px;
    border: 2px solid rgba(172, 22, 22, 0.55);
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,.45), 0 1px 4px rgba(0,0,0,.3);
  }

  /* Метки строк/колонок */
  .lbl {
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 9px;
    color: rgba(140, 10, 10, 0.95); font-weight: 700;
    background: #f0e6d0;
  }
  .lbl.col { padding-bottom: 1px; border-bottom: 1px solid rgba(172,22,22,.25); }
  .lbl.row { padding-right: 1px; border-right:  1px solid rgba(172,22,22,.25); }
</style>
