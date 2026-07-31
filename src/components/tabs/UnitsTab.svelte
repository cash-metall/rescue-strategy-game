<script lang="ts">
  import { game } from '../../state/game.svelte';
  import {
    TYPES, TRAINCOST, MAXLVL, coordName, fmtDur, fmtTime, gv, fatShown, fatLabel,
    lvl, trainTarget, available, isBusy, needsRest, cellAt, coverRate, type Unit,
  } from '../../engine';

  const g = $derived(game.g);

  function statusText(u: Unit): string {
    if (u.away === 'training') return 'Ушла на обучение — вернётся к следующему делу';
    if (u.away === 'injured') return 'Травма — выбыла до следующего дела';
    const left = Math.max(0, u.phaseEnd - g.t);
    if (u.status === 'travel') return `В пути к кв. ${coordName(u.mission!.x, u.mission!.y)} · прибытие через ${fmtDur(left)}`;
    if (u.status === 'search') {
      const m = u.mission!;
      const at = coordName(m.x, m.y);
      // У коптера фаза съёмки идёт по таймеру — там `phaseEnd` не врёт.
      if (u.type === 'drone') return `Съёмка кв. ${at} · ещё ~${fmtDur(left)}`;
      // А осмотр кончается по `swept >= 100`, а не по прогнозу `estSearch`: усталость и погода
      // режут темп уже в поле. Остаток от `phaseEnd` добегал до «ещё ~0 мин» и залипал, пока
      // группа ещё работала — то же враньё, что было у змейки покрытия. Считаем по остатку работы.
      const rate = coverRate(g, u, cellAt(g, m.x, m.y));
      const rest = rate > 0.01 ? Math.ceil((100 - m.swept) / rate) : null;
      return `Осмотр кв. ${at} · пройдено ${Math.round(m.swept)}%`
        + (rest == null ? ' · темп упал почти до нуля' : ` · ещё ~${fmtDur(rest)}`);
    }
    if (u.status === 'return') return `Возвращается в лагерь · ${fmtDur(left)}`;
    if (isBusy(g, u)) return `Занята по работе · до ${fmtTime(u.busyUntil).split(' · ')[1]}`;
    if (needsRest(u)) return 'Нужен отдых после происшествия';
    return u.fatigue > 1 ? 'В лагере · отдыхает' : 'В лагере · ' + gv(u, 'готова', 'готов') + ' к выходу';
  }

  function askTrain(u: Unit, target: number) {
    const L = lvl(u.type, target);
    const msg = `${u.name} → уровень ${target} (${L.name}).\n\n${L.note}\n\n`
      + 'Внимание: группа немедленно покинет этот поиск и станет доступна только в следующем деле. Продолжить?';
    if (confirm(msg)) game.train(u.id);
  }
</script>

{#if !g.units.length}
  <p class="stTxt">Отрядов нет.</p>
{:else}
  {#each g.units as u (u.id)}
    {@const f = fatShown(u)}
    {@const L = lvl(u.type, u.level)}
    {@const fCls = u.type === 'drone' ? (f < 30 ? 'crit' : f < 55 ? 'warn' : '') : (f > 70 ? 'crit' : f > 45 ? 'warn' : '')}
    {@const target = available(g, u) ? trainTarget(g, u) : 0}
    {@const canRecall = g.buildings.radio >= 3 && u.mission && u.status !== 'return' && u.type !== 'wind'}
    <div class="card" class:gone={!!u.away}>
      <h3>
        {TYPES[u.type].icon} {u.name}
        <span class="lvl">{'★'.repeat(u.level)}{'☆'.repeat(MAXLVL - u.level)}</span>
      </h3>
      <p class="eff">{L.name} — {L.note}</p>
      <p>{statusText(u)}</p>
      {#if !u.away}
        <div class="row">
          <span class="stTxt" style="display:flex;align-items:center;gap:6px">
            {fatLabel(u)}
            <span class="bar ubar {fCls}"><i style:width="{u.type === 'drone' ? f : 100 - f}%"></i></span>
            <b style="font-family:var(--mono)">{f}%</b>
          </span>
          <span>
            {#if target}
              <button class="btn mini" disabled={g.funds < TRAINCOST[target]} onclick={() => askTrain(u, target)}>
                🎓 Обучить · {TRAINCOST[target]} ₽
              </button>
            {/if}
            {#if canRecall}
              <button class="btn mini danger" onclick={() => game.recall(u.id)}>📻 Отозвать</button>
            {/if}
          </span>
        </div>
      {/if}
    </div>
  {/each}
  {#if g.buildings.train < 1}
    <p class="stTxt">🎓 Постройте учебный центр, чтобы повышать уровень отрядов: выше уровень — внимательнее поиск, меньше мусора и реже происшествия. Но обучение забирает группу из текущего дела.</p>
  {/if}
{/if}

<style>
  .card.gone { opacity: 0.45; }
</style>
