<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from '../state/game.svelte';
  import MapCell from './MapCell.svelte';
  import {
    unitPositions, inRange, targetable, effMark, dirArrow, COLS, W, H,
  } from '../engine';

  const XS = [...Array(W).keys()];
  const YS = [...Array(H).keys()];

  const g    = $derived(game.g);
  const upos = $derived(unitPositions(g));
  const heat = $derived(game.heat);

  // Квадраты, которые прямо сейчас прочёсываются (status === 'search')
  const searchingCells = $derived.by(() => {
    const s = new Set<string>();
    for (const u of g.units) {
      if (u.status === 'search' && u.mission) {
        s.add(`${u.mission.x},${u.mission.y}`);
      }
    }
    return s;
  });

  interface Mark { hq?: boolean; lkp?: boolean; victim?: boolean; trail?: boolean; sight?: 'human' | 'object'; arrows: { cls: string; ch: string }[]; }

  const marks = $derived.by(() => {
    const m = new Map<string, Mark>();
    const get = (k: string): Mark => { let v = m.get(k); if (!v) { v = { arrows: [] }; m.set(k, v); } return v; };
    get(`${g.hq.x},${g.hq.y}`).hq = true;
    get(`${g.lkp.x},${g.lkp.y}`).lkp = true;
    // Наводки «возможная цель»: коптер и телефонные звонки. Гаснут после проверки квадрата.
    for (const s of g.sightings) {
      if (s.checked) continue;
      const mk = get(`${s.x},${s.y}`);
      if (mk.sight !== 'human') mk.sight = s.kind;
    }
    for (const c of g.clues) {
      // улика без привязки к карте (сел навигатор) на карте не рисуется
      if (c.noPos) continue;
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
  let wrapW = $state(0);
  let wrapH = $state(0);

  const zoomed = $derived(scale > 1.5);

  let wrapEl: HTMLElement;

  // Игрок сам менял вид (зум/пан)? Тогда resize не сбрасывает его масштаб.
  let userAdjusted = false;

  function applyZoom(newScale: number, cx: number, cy: number) {
    newScale = Math.min(6, Math.max(0.28, newScale));
    const ratio = newScale / scale;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    scale = newScale;
    userAdjusted = true;
  }

  function resetView() {
    if (!wrapEl) return;
    const wr = wrapEl.getBoundingClientRect();
    wrapW = wr.width;
    wrapH = wr.height;
    // Размер сетки постоянен (GRID_PX), поэтому вписывание не зависит от текущего зума.
    const s = Math.min(wr.width / GRID_PX, wr.height / GRID_PX) * 0.96;
    scale = s;
    tx = (wr.width  - GRID_PX * s) / 2;
    ty = (wr.height - GRID_PX * s) / 2;
    userAdjusted = false;
  }

  onMount(() => {
    resetView();
    // Область карты меняет размер по двум разным поводам:
    //   • меняется ВЫСОТА — выросла/сжалась панель квадрата снизу, на телефоне уехала
    //     адресная строка. Вид не трогаем вообще: карта абсолютна и привязана к левому
    //     верхнему углу, поэтому без вмешательства она остаётся ровно на месте.
    //   • меняется ШИРИНА — ресайз окна или смена брейкпоинта. Здесь имеет смысл вписать
    //     карту заново, но только если игрок сам не выставил зум/пан.
    let prevW = wrapW;
    const ro = new ResizeObserver(() => {
      if (!wrapEl) return;
      const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
      if (!w || !h) return;                    // контейнер скрыт — считать нечего
      wrapW = w; wrapH = h;                    // подписи координат обновляем всегда
      const widthChanged = Math.abs(w - prevW) > 0.5;
      prevW = w;
      if (!widthChanged) return;               // изменилась только высота — карта стоит на месте
      if (pressing || pinching) return;        // не дёргать вид во время жеста
      if (!userAdjusted) resetView();
    });
    ro.observe(wrapEl);
    return () => ro.disconnect();
  });

  // ── Геометрия сетки ─────────────────────────────────────────────────────────
  // Зазора между клетками нет (gap: 0): линии сетки рисует SVG-слой поверх ячеек
  // штрихом с vector-effect: non-scaling-stroke. Поэтому шаг = размеру клетки,
  // а размер сетки постоянен при любом зуме.
  const CELL_PX   = 46;
  const CELL_STEP = CELL_PX;      // gap = 0 — шаг равен размеру ячейки
  const GRID_PAD  = 0;            // у .grid больше нет ни padding, ни border
  const GRID_PX   = W * CELL_PX;  // 552 — постоянный размер сетки
  const cellCX = (i: number) => GRID_PAD + i * CELL_STEP + CELL_PX / 2; // = 23 + 46i

  // Линии сетки: 13 вертикалей + 13 горизонталей одним путём. От зума не зависит.
  const LINES_D = [...Array(W + 1).keys()].map((i) => `M${i * CELL_PX},0V${GRID_PX}`)
    .concat([...Array(H + 1).keys()].map((i) => `M0,${i * CELL_PX}H${GRID_PX}`))
    .join(' ');

  // ── Sticky-метки колонок и строк ─────────────────────────────────────────────
  interface LPos { txt: string; vx: number; vy: number; }

  const colLabels = $derived.by((): LPos[] => {
    if (scale < 0.35) return [];
    const out: LPos[] = [];
    for (let x = 0; x < W; x++) {
      const cellL = tx + (GRID_PAD + x * CELL_STEP) * scale;
      const cellR = cellL + CELL_PX * scale;
      if (cellR < -10 || cellL > wrapW + 10) continue;
      const vx = tx + cellCX(x) * scale;
      const vy = Math.max(4, Math.min(ty + GRID_PAD * scale, wrapH - 22));
      out.push({ txt: COLS[x], vx, vy });
    }
    return out;
  });

  const rowLabels = $derived.by((): LPos[] => {
    if (scale < 0.35) return [];
    const out: LPos[] = [];
    for (let y = 0; y < H; y++) {
      const cellT = ty + (GRID_PAD + y * CELL_STEP) * scale;
      const cellB = cellT + CELL_PX * scale;
      if (cellB < -10 || cellT > wrapH + 10) continue;
      const vy = ty + cellCX(y) * scale;
      const vx = Math.max(4, Math.min(tx + GRID_PAD * scale, wrapW - 22));
      out.push({ txt: String(y + 1), vx, vy });
    }
    return out;
  });

  // ── Взаимодействие: единый $effect ──────────────────────────────────────────
  //
  // Вся логика указателя/касания сосредоточена здесь.
  // Нет setPointerCapture, нет разных систем событий — одна точка истины.
  //
  // Таймер одиночного тапа (вариант А):
  //   tap#1 → 300ms таймер → game.select()    (одиночный тап)
  //   tap#1 → tap#2 в 260ms → отменить таймер, applyZoom()   (двойной тап)
  //   drag  → отменить таймер, пан            (перетаскивание)

  // Флаги взаимодействия (не реактивные — только для внутренней логики)
  let pressing      = false;   // указатель нажат
  let didDrag       = false;   // движение превысило порог
  let activePid     = -1;      // pointerId активного касания
  let dragPx = 0, dragPy = 0, dragTx = 0, dragTy = 0;

  // Одиночный тап с задержкой
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; } };

  // Двойной тап
  let lastTapTime = 0;
  let lastTapX    = 0;
  let lastTapY    = 0;

  // Блокировка ghost-click после drag (не после double-tap — там клик не нужен)
  let suppressClick = false;

  // Pinch zoom
  let pinching = false;
  let pinchD = 0, pinchMx = 0, pinchMy = 0;

  $effect(() => {
    if (!wrapEl) return;
    const el = wrapEl;

    // ── Pointer: пан + одиночный/двойной тап ────────────────────────────────

    const onPtrDown = (e: PointerEvent) => {
      if (e.button !== 0 || activePid !== -1) return; // только первый палец
      activePid = e.pointerId;
      pressing  = true;
      didDrag   = false;
      dragPx = e.clientX; dragPy = e.clientY;
      dragTx = tx;        dragTy = ty;
    };

    const onPtrMove = (e: PointerEvent) => {
      if (e.pointerId !== activePid || !pressing) return;
      const dx = e.clientX - dragPx;
      const dy = e.clientY - dragPy;
      if (!didDrag && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        didDrag = true;
        cancelTap(); // drag — отменяем ожидающий одиночный тап
      }
      if (didDrag) { tx = dragTx + dx; ty = dragTy + dy; userAdjusted = true; }
    };

    const onPtrUp = (e: PointerEvent) => {
      if (e.pointerId !== activePid || !pressing) return;
      pressing      = false;
      activePid     = -1;
      const wasDrag = didDrag;
      didDrag       = false;

      if (wasDrag) {
        suppressClick = true; // заглушить ghost-click после пана
        lastTapTime   = 0;   // drag сбрасывает окно двойного тапа
        return;
      }

      // Чистый тап — одиночный или двойной?
      const now  = performance.now();
      const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);

      if (now - lastTapTime < 260 && dist < 40) {
        // ── Двойной тап: зум ×2 ────────────────────────────────────────────
        cancelTap(); // отменяем таймер тапа #1 — ячейка не откроется
        const r = el.getBoundingClientRect();
        applyZoom(scale * 2, e.clientX - r.left, e.clientY - r.top);
        lastTapTime = 0; // тройной тап — не зумит повторно
      } else {
        // ── Первый тап: запустить таймер 300ms ──────────────────────────────
        // Если за это время придёт второй тап — таймер отменится (zoom).
        // Если нет — таймер вызовет game.select().
        lastTapTime = now;
        lastTapX    = e.clientX;
        lastTapY    = e.clientY;

        const elAt   = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
        const cellEl = elAt?.closest?.('.cell') as HTMLElement | null;
        if (cellEl) {
          const cx = Number(cellEl.dataset.cx);
          const cy = Number(cellEl.dataset.cy);
          cancelTap(); // на случай если предыдущий таймер ещё не сработал
          tapTimer = setTimeout(() => { tapTimer = null; game.select(cx, cy); }, 300);
        }
      }
    };

    const onPtrCancel = (e: PointerEvent) => {
      if (e.pointerId !== activePid) return;
      pressing = false; activePid = -1; didDrag = false;
      cancelTap();
      lastTapTime = 0;
    };

    // Ghost-click после drag — подавить. Double-tap click не нужно подавлять,
    // т.к. onclick убран с MapCell.
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClick) { suppressClick = false; e.stopPropagation(); }
    };

    // ── Wheel: зум колёсиком (мышь / трекпад) ───────────────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      applyZoom(scale * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX - r.left, e.clientY - r.top);
    };

    // ── Touch pinch: зум двумя пальцами ─────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        cancelTap();    // pinch отменяет ожидающий тап
        pinching  = true;
        pressing  = false;
        activePid = -1;
        lastTapTime = 0;
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
        applyZoom(scale * (d / pinchD), pinchMx, pinchMy);
        tx += mx - pinchMx;
        ty += my - pinchMy;
        pinchD = d; pinchMx = mx; pinchMy = my;
      }
    };

    const onTouchEnd = () => { pinching = false; };

    el.addEventListener('pointerdown',   onPtrDown);
    el.addEventListener('pointermove',   onPtrMove);
    el.addEventListener('pointerup',     onPtrUp);
    el.addEventListener('pointercancel', onPtrCancel);
    el.addEventListener('click',         onClickCapture, { capture: true });
    el.addEventListener('wheel',         onWheel,        { passive: false });
    el.addEventListener('touchstart',    onTouchStart,   { passive: false });
    el.addEventListener('touchmove',     onTouchMove,    { passive: false });
    el.addEventListener('touchend',      onTouchEnd);

    return () => {
      cancelTap();
      el.removeEventListener('pointerdown',   onPtrDown);
      el.removeEventListener('pointermove',   onPtrMove);
      el.removeEventListener('pointerup',     onPtrUp);
      el.removeEventListener('pointercancel', onPtrCancel);
      el.removeEventListener('click',         onClickCapture, true);
      el.removeEventListener('wheel',         onWheel);
      el.removeEventListener('touchstart',    onTouchStart);
      el.removeEventListener('touchmove',     onTouchMove);
      el.removeEventListener('touchend',      onTouchEnd);
    };
  });
</script>

<!-- ── Карта с пан/зум ────────────────────────────────────────────────────── -->
<div class="mapwrap" bind:this={wrapEl}>

  <!-- Трансформируемая сетка -->
  <div class="gridwrap" style:transform="translate({tx}px,{ty}px) scale({scale})" style:--s={scale}>
    <div class="grid" class:zoomed>
      {#each YS as y (y)}
        {#each XS as x (x)}
          {@const cell = g.map[y][x]}
          <MapCell
            {cell}
            far={!inRange(g, cell) && targetable(cell)}
            heat={heat ? heat[y][x] : 0}
            units={upos.get(x + ',' + y)}
            mark={marks.get(x + ',' + y)}
            over={!!g.over}
            {zoomed}
            isSearching={searchingCells.has(x + ',' + y)}
          />
        {/each}
      {/each}
    </div>

    <!-- Линии сетки и рамка выбора: штрих в экранных пикселях, не зависит от зума -->
    <svg class="lines" width={GRID_PX} height={GRID_PX}
         viewBox="0 0 {GRID_PX} {GRID_PX}" aria-hidden="true">
      <path class="gl" d={LINES_D} />
      {#if g.ui.sel}
        <rect class="selframe"
              x={g.ui.sel.x * CELL_PX} y={g.ui.sel.y * CELL_PX}
              width={CELL_PX} height={CELL_PX} />
      {/if}
    </svg>
  </div>

  <!-- ── Sticky coordinate labels ──────────────────────────────────────────── -->
  <div class="coord-overlay" aria-hidden="true">
    {#each colLabels as l (l.txt)}
      <div class="clbl ccol" style:left="{l.vx}px" style:top="{l.vy}px">{l.txt}</div>
    {/each}
    {#each rowLabels as l (l.txt)}
      <div class="clbl crow" style:left="{l.vx}px" style:top="{l.vy}px">{l.txt}</div>
    {/each}
  </div>

  <!-- Кнопка сброса зума -->
  <button class="resetbtn" onclick={resetView} title="Вписать карту в экран">⊞</button>
</div>

<style>
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

  .mapwrap {
    flex: 1; overflow: hidden; position: relative;
    touch-action: none; cursor: grab;
    background: #e6ddc8;
    -webkit-user-select: none; user-select: none;
  }
  .mapwrap:active { cursor: grabbing; }

  .gridwrap {
    position: absolute; top: 0; left: 0;
    transform-origin: 0 0;
    /* Без will-change: иначе Chrome держит слой на устаревшем raster scale,
       и тонкие линии при зуме размываются в ноль. */
  }

  .grid {
    display: grid;
    gap: 0;
    width: max-content;
    grid-template-columns: repeat(12, 46px);
    grid-template-rows: repeat(12, 46px);
    /* Фон не виден (клетки вплотную), но страхует от волосяных швов при дробном смещении */
    background: rgba(172, 22, 22, 0.55);
    box-shadow: 0 4px 24px rgba(0,0,0,.45), 0 1px 4px rgba(0,0,0,.3);
  }

  /* Сетка рисуется поверх клеток штрихом в экранных пикселях: толщина линии
     одинакова на любом зуме и линия не может «схлопнуться» в 0 пикселей. */
  .lines {
    position: absolute; left: 0; top: 0;
    overflow: visible;   /* внешняя половина штриха по периметру видна */
    pointer-events: none;
    z-index: 4;          /* поверх клеток, под .coord-overlay (z-index: 5) */
  }

  .lines .gl {
    fill: none;
    stroke: rgba(172, 22, 22, 0.55);
    stroke-width: 2px;
    stroke-linecap: square;             /* без выемок в углах периметра */
    vector-effect: non-scaling-stroke;
  }

  .lines .selframe {
    fill: none;
    stroke: var(--amber);
    stroke-width: 2.5px;
    vector-effect: non-scaling-stroke;
  }

  .coord-overlay {
    position: absolute; inset: 0;
    pointer-events: none; overflow: hidden;
    z-index: 5;
  }

  .clbl {
    position: absolute;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    color: rgba(130, 8, 8, 0.95);
    background: rgba(242, 233, 210, 0.93);
    border: 1px solid rgba(172, 22, 22, 0.28);
    border-radius: 3px;
    padding: 1px 4px;
    line-height: 1.4;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(0,0,0,.22), 0 0 0 1px rgba(172,22,22,.10);
  }

  .clbl.ccol { transform: translateX(-50%); }
  .clbl.crow { transform: translateY(-50%); min-width: 18px; text-align: center; }
</style>
