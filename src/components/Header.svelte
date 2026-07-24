<script lang="ts">
  import { game } from '../state/game.svelte';
  import SpeedControls from './SpeedControls.svelte';
  import { fmtTime, WEATHER, MISSCAP, activeMissions, isNight } from '../engine';

  const g = $derived(game.g);
  const s = $derived(g.victim.strength);
  const barCls = $derived(s < 35 ? 'crit' : s < 60 ? 'warn' : '');
</script>

<header class="hdr">
  <div class="brand"><span class="dot"></span>Оперативный штаб · Поиск</div>
  <div class="stat"><b>{fmtTime(g.t)}</b><span>время</span></div>
  <div class="stat"><b>{WEATHER[g.weather].icon} {WEATHER[g.weather].name}{isNight(g) ? ' · 🌙 ночь' : ''}</b><span>погода</span></div>
  <div class="stat"><b>{Math.floor(g.funds)}</b><span>фонд, ₽</span></div>
  <div class="stat"><b>{activeMissions(g)}/{MISSCAP[g.buildings.radio]}</b><span>группы в поле</span></div>
  <div class="stat"><b>{game.campaign.stats.won} / {game.campaign.stats.won + game.campaign.stats.lost}</b><span>спасено / дел</span></div>
  <div class="stat vic">
    <div class="bar {barCls}"><i style:width="{s}%"></i></div>
    <span>состояние · <b>{Math.round(s)}%</b></span>
  </div>
  <SpeedControls />
</header>

<style>
  .hdr { display: flex; align-items: center; gap: 18px; padding: 8px 14px; background: linear-gradient(180deg, #1a231c, #141b16); border-bottom: 1px solid var(--line); white-space: nowrap; overflow-x: auto; }
  .brand { font-family: var(--disp); font-size: 17px; letter-spacing: .14em; text-transform: uppercase; color: var(--amber); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--red); margin-right: 8px; animation: blink 1.6s infinite; }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  .stat { display: flex; flex-direction: column; gap: 1px; min-width: 70px; }
  .stat b { font-family: var(--mono); font-size: 14px; font-weight: 600; }
  .stat span { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--mut); }
  .vic { min-width: 150px; }
  .bar { height: 7px; background: #232d24; border: 1px solid var(--line); border-radius: 2px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--green); transition: width .4s; }
  .bar.warn i { background: var(--amber); }
  .bar.crit i { background: var(--red); }
</style>
