<script lang="ts">
  import { game } from '../../state/game.svelte';
  import { BUILD, TYPES, TENTCAP, type BuildKey, type UnitType } from '../../engine';

  const g = $derived(game.g);
  const buildKeys = Object.keys(BUILD) as BuildKey[];
  const unitTypes = Object.keys(TYPES) as UnitType[];
</script>

<div class="secH">Развитие лагеря</div>
{#each buildKeys as key (key)}
  {@const b = BUILD[key]}
  {@const cur = g.buildings[key]}
  <div class="card">
    <h3>{b.icon} {b.name} <span class="lvl">ур. {cur}/{b.max}</span></h3>
    <p class="eff">{b.lvls[cur] || '—'}</p>
    {#if cur < b.max}
      {@const cost = b.costs[cur + 1]}
      <div class="row">
        <span class="stTxt">Дальше: {b.lvls[cur + 1]}</span>
        <button class="btn mini" disabled={g.funds < cost} onclick={() => game.build(key)}>Улучшить · {cost} ₽</button>
      </div>
    {/if}
  </div>
{/each}

<div class="secH">Наём отрядов ({g.units.length}/{TENTCAP[g.buildings.tent]})</div>
{#each unitTypes as type (type)}
  {@const T = TYPES[type]}
  {@const locked = g.buildings.tent < T.unlock}
  {@const full = g.units.length >= TENTCAP[g.buildings.tent]}
  <div class="card">
    <h3>{T.icon} {T.name}</h3>
    <p>{T.desc}</p>
    <div class="row">
      <span class="stTxt">
        {#if locked}🔒 Нужен шатёр ур. {T.unlock}{:else}Стоимость: <b>{T.cost} ₽</b>{/if}
      </span>
      <button class="btn mini" disabled={locked || full || g.funds < T.cost} onclick={() => game.hire(type)}>Нанять</button>
    </div>
  </div>
{/each}
