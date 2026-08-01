<script lang="ts">
  import { game } from '../state/game.svelte';
  import {
    TERR, TYPES, coordName, fmtDur, RECON_MIN,
    cellAt, inRange, detectEff, searchEst, planTrip, missionSlots, sendBlock,
    available, freeWinds, lvl,
  } from '../engine';
  import Icon from './Icon.svelte';

  const g = $derived(game.g);
  const sel = $derived(g.ui.sel);
  const cell = $derived(sel ? cellAt(g, sel.x, sel.y) : null);
  // Туман войны: до картографа ур. 1 нераскрытый квадрат — местность неизвестна.
  const fog = $derived(!!cell && g.buildings.carto === 0 && !cell.revealed);
  const ready = $derived(g.units.filter(u => available(g, u) && u.type !== 'wind'));
  const cluesHere = $derived(sel ? g.clues.filter(c => c.x === sel.x && c.y === sel.y && !c.noPos) : []);
  const sightHere = $derived(sel ? g.sightings.filter(s => s.x === sel.x && s.y === sel.y && !s.checked) : []);
  const slots = $derived(missionSlots(g));
  const winds = $derived(freeWinds(g).length);
</script>

<div class="cellpanel">
  {#if !sel || !cell}
    <h3>Квадрат не выбран</h3>
    <p class="stTxt">Кликните по квадрату карты, чтобы отправить туда поисковую группу. 📍 — точка, где пропавшего видели в последний раз.</p>
  {:else}
    <h3>Квадрат {coordName(sel.x, sel.y)} · {fog ? 'местность неизвестна' : TERR[cell.terrain].name}</h3>
    {#if fog}
      <p class="stTxt">Квадрат в тумане — тип местности неизвестен. Отправьте сюда группу, чтобы разведать его (или улучшите картографа до ур. 1, чтобы открыть карту).</p>
    {:else if cell.terrain === 'base'}
      <p class="stTxt">Это ваш лагерь. Здесь отряды отдыхают и сдают находки.</p>
    {:else if cell.terrain === 'lake'}
      <p class="stTxt">Открытая вода. Наземный поиск здесь невозможен.</p>
    {:else if !inRange(g, cell)}
      <p class="stTxt">⚠️ Вне радиуса связи. Улучшите радиостанцию, чтобы координировать поиск в этом квадрате.</p>
    {:else}
      <p class="stTxt">Осмотрено: <b>{Math.round(cell.shown)}%</b>{#if g.buildings.carto >= 3 && cell.searchedEff != null} · качество осмотра <b>{Math.round(cell.searchedEff * 100)}%</b>{/if}{#if sel.x === g.lkp.x && sel.y === g.lkp.y} · <span class="hl">📍 точка последнего контакта</span>{/if}{#if cluesHere.length} · находок здесь: <b>{cluesHere.length}</b>{/if}</p>

      {#if sightHere.length}
        <div class="secH">Наводки</div>
        {#each sightHere.slice(0, 3) as s (s.id)}
          <p class="stTxt">{s.kind === 'human' ? '🚨' : '❓'} {s.text} — <span class="hl">нужна наземная группа</span></p>
        {/each}
      {/if}

      {#if !ready.length}
        <p class="stTxt" style="margin-top:8px">Свободных отрядов нет — кто в поле, кто отдыхает, кто занят по работе.</p>
      {:else}
        <div class="secH">Кого отправить</div>
        {#each ready as u (u.id)}
          {@const T = TYPES[u.type]}
          {@const L = lvl(u.type, u.level)}
          {@const block = sendBlock(g, u, cell)}
          {@const trip = planTrip(g, u, cell, null)}
          {@const est = u.type === 'drone' ? RECON_MIN : searchEst(g, u, cell)}
          {@const tired = u.type === 'drone' ? u.fatigue > 75 : u.fatigue >= 90}
          {@const off = tired || !!block}
          <div class="urow" class:dis={off}>
            <label>
              <input type="checkbox" checked={g.ui.selUnits.has(u.id) && !off} disabled={off}
                     onchange={(e) => game.toggleUnit(u.id, (e.currentTarget as HTMLInputElement).checked)} />
              <span class="nm"><Icon src={T.svg} size={16} /> {u.name} <span class="lvl">{L.name}</span></span>
              <span class="inf">
                {#if block}⛔ {block}
                {:else if tired}нужен отдых
                {:else}
                  качество {Math.round(detectEff(u) * 100)}% · путь ~{fmtDur(trip.travel)}
                  {#if u.type === 'drone'}· съёмка {RECON_MIN} мин{:else}· осмотр ~{est === Infinity ? '—' : fmtDur(est)}{/if}
                {/if}
              </span>
            </label>
          </div>
        {/each}

        <div class="row">
          <span class="stTxt">Слотов рации: <b>{slots}</b>{#if winds} · «Ветров» свободно: <b>{winds}</b>{/if}</span>
          <button class="btn primary" disabled={slots <= 0} onclick={() => game.send()}>Отправить на поиск</button>
        </div>
        {#if winds}
          <p class="stTxt">🚙 Пеших и кинологов подвезёт «Ветер»: в дороге не устанут и выйдут на осмотр свежими.</p>
        {/if}
      {/if}

      {#if cluesHere.length}
        <div class="secH">Найдено в этом квадрате</div>
        {#each cluesHere.slice(0, 4) as c (c.id)}
          <p class="stTxt">• {c.text}</p>
        {/each}
      {/if}
    {/if}
  {/if}
</div>

<style>
  .cellpanel { padding: 10px 12px; }
  .cellpanel h3 { font-size: 13px; color: var(--amber); margin-bottom: 6px; }
</style>
