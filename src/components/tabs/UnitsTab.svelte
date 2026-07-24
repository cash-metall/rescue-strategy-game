<script lang="ts">
  import { game } from '../../state/game.svelte';
  import { TYPES, TRAINCOST, coordName, fmtDur, gv, fatShown, fatLabel, type Unit } from '../../engine';

  const g = $derived(game.g);

  function statusText(u: Unit): string {
    const left = Math.max(0, u.phaseEnd - g.t);
    if (u.status === 'idle') return u.fatigue > 1 ? 'В лагере · отдыхает' : 'В лагере · ' + gv(u, 'готова', 'готов') + ' к выходу';
    if (u.status === 'travel') return `В пути к кв. ${coordName(u.mission!.x, u.mission!.y)} · прибытие через ${fmtDur(left)}`;
    if (u.status === 'search') return `Ведёт поиск в кв. ${coordName(u.mission!.x, u.mission!.y)} · ещё ${fmtDur(left)}`;
    if (u.status === 'return') return `Возвращается в лагерь · ${fmtDur(left)}`;
    return `На обучении · ещё ${fmtDur(left)}`;
  }
</script>

{#if !g.units.length}
  <p class="stTxt">Отрядов нет.</p>
{:else}
  {#each g.units as u (u.id)}
    {@const f = fatShown(u)}
    {@const fCls = u.type === 'drone' ? (f < 30 ? 'crit' : f < 55 ? 'warn' : '') : (f > 70 ? 'crit' : f > 45 ? 'warn' : '')}
    {@const canTrain = u.status === 'idle' && u.level < 3 && g.buildings.train >= u.level}
    {@const canRecall = g.buildings.radio >= 3 && u.mission && u.status !== 'return'}
    <div class="card">
      <h3>{TYPES[u.type].icon} {u.name} <span class="lvl">{'★'.repeat(u.level)}{'☆'.repeat(3 - u.level)}</span></h3>
      <p>{statusText(u)}</p>
      <div class="row">
        <span class="stTxt" style="display:flex;align-items:center;gap:6px">
          {fatLabel(u)}
          <span class="bar ubar {fCls}"><i style:width="{u.type === 'drone' ? f : 100 - f}%"></i></span>
          <b style="font-family:var(--mono)">{f}%</b>
        </span>
        <span>
          {#if canTrain}
            <button class="btn mini" disabled={g.funds < TRAINCOST[u.level + 1]} onclick={() => game.train(u.id)}>🎓 Обучить · {TRAINCOST[u.level + 1]} ₽</button>
          {/if}
          {#if canRecall}
            <button class="btn mini danger" onclick={() => game.recall(u.id)}>📻 Отозвать</button>
          {/if}
        </span>
      </div>
    </div>
  {/each}
  {#if g.buildings.train < 1}
    <p class="stTxt">🎓 Постройте учебный центр, чтобы повышать уровень отрядов: выше уровень — быстрее ход и внимательнее поиск.</p>
  {/if}
{/if}
