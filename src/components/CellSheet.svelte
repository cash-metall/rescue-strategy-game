<script lang="ts">
  import { game } from '../state/game.svelte';
  import {
    TERR, TYPES, MISSCAP, coordName, fmtDur,
    cellAt, inRange, searchEff, travelTime, activeMissions, lvlFat,
  } from '../engine';

  const g = $derived(game.g);
  const sel = $derived(g.ui.sel);
  const cell = $derived(sel ? cellAt(g, sel.x, sel.y) : null);
  const idle = $derived(g.units.filter(u => u.status === 'idle'));
  const cluesHere = $derived(sel ? g.clues.filter(c => c.x === sel.x && c.y === sel.y) : []);
  const slots = $derived(MISSCAP[g.buildings.radio] - activeMissions(g));
  const durs = [
    { v: 40, label: 'Быстрый осмотр (40 мин)' },
    { v: 80, label: 'Стандартный (1 ч 20 мин)' },
    { v: 140, label: 'Тщательный (2 ч 20 мин)' },
  ];
</script>

<div class="cellpanel">
  {#if !sel || !cell}
    <h3>Квадрат не выбран</h3>
    <p class="stTxt">Кликните по квадрату карты, чтобы отправить туда поисковую группу. 📍 — точка, где пропавшего видели в последний раз.</p>
  {:else}
    <h3>Квадрат {coordName(sel.x, sel.y)} · {TERR[cell.terrain].name}</h3>
    {#if cell.terrain === 'base'}
      <p class="stTxt">Это ваш лагерь. Здесь отряды отдыхают и сдают находки.</p>
    {:else if cell.terrain === 'lake'}
      <p class="stTxt">Открытая вода. Наземный поиск здесь невозможен.</p>
    {:else if !inRange(g, cell)}
      <p class="stTxt">⚠️ Вне радиуса связи. Улучшите радиостанцию, чтобы координировать поиск в этом квадрате.</p>
    {:else}
      <p class="stTxt">Осмотрено: <b>{Math.round(cell.coverage)}%</b>{#if sel.x === g.lkp.x && sel.y === g.lkp.y} · <span class="hl">📍 точка последнего контакта</span>{/if}{#if cluesHere.length} · находок здесь: <b>{cluesHere.length}</b>{/if}</p>

      {#if !idle.length}
        <p class="stTxt" style="margin-top:8px">Свободных отрядов нет — все в поле, на отдыхе они появятся здесь.</p>
      {:else}
        <div class="secH">Кого отправить</div>
        {#each idle as u (u.id)}
          {@const T = TYPES[u.type]}
          {@const eff = Math.round(searchEff(g, u, cell) * 100)}
          {@const tt = travelTime(g, u, cell)}
          {@const tired = u.type === 'drone' ? u.fatigue > 75 : u.fatigue >= 90}
          {@const est = u.type === 'drone' ? Math.round((tt + 0.6 * tt) * T.fatT * lvlFat(u) + g.ui.dur * T.fatS * lvlFat(u)) : 0}
          {@const low = u.type === 'drone' && (100 - u.fatigue) < est + 5}
          <div class="urow" class:dis={tired}>
            <label>
              <input type="checkbox" checked={g.ui.selUnits.has(u.id) && !tired} disabled={tired}
                     onchange={(e) => game.toggleUnit(u.id, (e.currentTarget as HTMLInputElement).checked)} />
              <span class="nm">{T.icon} {u.name}{#if u.level > 1} <span class="lvl">ур.{u.level}</span>{/if}</span>
              <span class="inf">эфф. {eff}% · путь ~{fmtDur(tt)}{tired ? ' · нужен отдых' : low ? ' · ⚠️ может не хватить заряда' : ''}</span>
            </label>
          </div>
        {/each}

        <div class="durrow">
          {#each durs as d (d.v)}
            <label><input type="radio" name="dur" checked={g.ui.dur === d.v} onchange={() => game.setDur(d.v)} />{d.label}</label>
          {/each}
        </div>

        <div class="row">
          <span class="stTxt">Свободных «слотов» рации: <b>{slots}</b></span>
          <button class="btn primary" disabled={slots <= 0} onclick={() => game.send()}>Отправить на поиск</button>
        </div>
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
