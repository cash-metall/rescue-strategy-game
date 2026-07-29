<script lang="ts">
  import { game } from '../state/game.svelte';
  import { fmtTime, WEATHER, isNight } from '../engine';

  const g       = $derived(game.g);
  const s       = $derived(g.victim.strength);
  const barCls  = $derived(s < 35 ? 'crit' : s < 60 ? 'warn' : '');
  const night   = $derived(isNight(g));
  const canHeat = $derived(g.buildings.carto >= 1);

  let settingsOpen = $state(false);
  const closeSettings = () => { settingsOpen = false; };

  function togglePause() {
    if (game.paused) game.setSpeed(g.ui.speed || 1);
    else game.pause();
  }
</script>

<!-- ── Полоска здоровья пропавшего — самый важный индикатор давления ── -->
<div class="vtrack">
  {#if !g.medicsGone}
    <div class="vfill {barCls}" style:width="{s}%" class:pulse={s < 35}></div>
  {/if}
</div>

<!-- ── Левая пилюля: время + погода + состояние ── -->
<div class="pill left">
  <span class="time">{fmtTime(g.t)}{night ? ' 🌙' : ''}</span>
  <span class="sep">·</span>
  <span>{WEATHER[g.weather].icon}</span>
  <span class="sep">·</span>
  {#if g.medicsGone}
    <span class="str crit" title="Медики уехали: найти живым — 50/50">🚑&nbsp;50/50</span>
  {:else}
    <span class="str {barCls}">♥&nbsp;{Math.round(s)}%</span>
  {/if}
</div>

<!-- ── Правая пилюля: фонд + шестерёнка ── -->
<div class="pill right">
  <span class="funds">₽&thinsp;{Math.floor(g.funds)}</span>
  <button class="gear" class:active={settingsOpen}
          onclick={() => { settingsOpen = !settingsOpen; }}
          aria-label="Настройки игры" aria-expanded={settingsOpen}>⚙</button>
</div>

<!-- ── Настройки: плавающая панель + подложка ── -->
{#if settingsOpen}
  <div class="s-back" role="button" tabindex="-1" aria-label="Закрыть"
       onclick={closeSettings}
       onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') closeSettings(); }}></div>

  <div class="s-panel">
    <!-- Скорость -->
    <div class="s-row">
      <button class="sbtn" class:on={game.paused} onclick={togglePause} title="Пауза/Продолжить">⏸</button>
      <button class="sbtn" class:on={!game.paused && g.ui.speed === 1} onclick={() => game.setSpeed(1)}>1×</button>
      <button class="sbtn" class:on={!game.paused && g.ui.speed === 2} onclick={() => game.setSpeed(2)}>2×</button>
      <button class="sbtn" class:on={!game.paused && g.ui.speed === 4} onclick={() => game.setSpeed(4)}>4×</button>
    </div>
    <!-- Тепловая карта -->
    <button class="smitem" class:on={g.ui.heat} disabled={!canHeat}
            title={canHeat ? 'Карта вероятности' : 'Требуется картограф'}
            onclick={() => { game.toggleHeat(); closeSettings(); }}>
      🔥 Карта вероятности
    </button>
    <div class="s-div"></div>
    <button class="smitem" onclick={() => { game.openModal('settings'); closeSettings(); }}>
      ⚙ Штаб и прогресс
    </button>
    <button class="smitem" onclick={() => { game.openHelp(); closeSettings(); }}>
      ? Справка
    </button>
  </div>
{/if}

<style>
  /* ── Полоска здоровья ── */
  .vtrack {
    position: absolute; top: 0; left: 0; right: 0; height: 5px;
    background: rgba(0,0,0,.25); z-index: 12; pointer-events: none;
  }
  .vfill {
    height: 100%; background: var(--green); transition: width .5s, background .4s;
  }
  .vfill.warn { background: var(--amber); }
  .vfill.crit { background: var(--red); }
  .vfill.pulse { animation: hpulse 1.2s infinite; }
  @keyframes hpulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .vfill.pulse { animation: none; } }

  /* ── Пилюли ── */
  .pill {
    position: absolute; top: 9px; z-index: 11;
    display: flex; align-items: center; gap: 6px;
    background: rgba(10, 18, 12, 0.72);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,.10);
    border-radius: 20px; padding: 4px 10px;
    font-size: 12px; color: #d8e4d4; white-space: nowrap;
    pointer-events: all; user-select: none;
  }
  .pill.left  { left: 8px; }
  .pill.right { right: 8px; gap: 8px; }

  .time { font-family: var(--mono); font-size: 13px; font-weight: 600; letter-spacing: .04em; }
  .sep  { color: rgba(255,255,255,.3); font-size: 10px; }
  .funds { font-family: var(--mono); font-size: 13px; font-weight: 600; }
  .str  { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--green); }
  .str.warn { color: var(--amber); }
  .str.crit { color: var(--red); }

  /* ── Кнопка шестерёнки ── */
  .gear {
    font-size: 15px; line-height: 1; padding: 0 2px;
    color: rgba(255,255,255,.65); background: none; border: none; cursor: pointer;
    transition: color .15s, transform .15s;
  }
  .gear:hover { color: var(--amber); }
  .gear.active { color: var(--amber); transform: rotate(60deg); }

  /* ── Подложка ── */
  .s-back {
    position: absolute; inset: 0; z-index: 19;
  }

  /* ── Панель настроек ── */
  .s-panel {
    position: absolute; top: calc(9px + 30px + 6px); right: 8px;
    z-index: 20; min-width: 190px;
    background: rgba(14, 22, 16, 0.95);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 10px; padding: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,.55);
    display: flex; flex-direction: column; gap: 2px;
  }

  /* Ряд скорости */
  .s-row { display: flex; gap: 4px; margin-bottom: 4px; }
  .sbtn {
    flex: 1; padding: 5px 2px; font-size: 12px; font-family: var(--mono);
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
    border-radius: 6px; color: #b0c0b0; cursor: pointer; transition: background .12s, color .12s;
  }
  .sbtn:hover { background: rgba(255,255,255,.15); color: #fff; }
  .sbtn.on { background: var(--amber); color: #171207; border-color: var(--amber); font-weight: 700; }

  /* Пункты меню */
  .smitem {
    width: 100%; text-align: left; padding: 7px 10px; font-size: 12px;
    background: none; border: none; border-radius: 6px;
    color: #b8ccb8; cursor: pointer; transition: background .12s, color .12s;
  }
  .smitem:hover:not(:disabled) { background: rgba(255,255,255,.10); color: #fff; }
  .smitem.on { color: var(--amber); }
  .smitem:disabled { opacity: .4; cursor: not-allowed; }

  .s-div { height: 1px; background: rgba(255,255,255,.1); margin: 4px 0; }
</style>
