<script lang="ts">
  import { slide } from 'svelte/transition';
  import { game } from '../../state/game.svelte';
  import { EXPCOST, EXPREWARD, EXPT, EXP_LVL, coordName, fmtTimeAt, effMark, dirName, dirArrow } from '../../engine';

  const g = $derived(game.g);

  // TabPanel монтирует вкладку заново при каждом переключении, а `in:` играет на
  // монтировании элемента. Без этого весь список разъезжался бы анимацией при каждом
  // заходе на вкладку — анимируем только те улики, что пришли уже при открытой вкладке.
  const known = new Set(game.g.clues.map(c => c.id));
</script>

{#if !g.clues.length}
  <p class="stTxt">Пока находок нет. Отправляйте группы обследовать квадраты вокруг точки 📍.</p>
{:else}
  <p class="stTxt">Сверяйте находки с приметами во вкладке «Дело» и сами решайте: 📌 улика или 🗑 мусор. Отметка «улика» выводит направление на карту — ошибётесь, поведёте поиск не туда. Экспертиза ({EXPCOST} ₽) даёт точное заключение; за верную догадку вернут {EXPREWARD} ₽.</p>
  {#each g.clues as c (c.id)}
    {@const m = effMark(c)}
    {@const cls = c.verdict === 'real' ? 'vreal' : m === 'real' ? 'mreal' : m === 'junk' ? 'mjunk' : ''}
    {@const canExp = g.buildings.tent >= EXP_LVL && !c.exp}
    <div class="card clue {cls}" in:slide={{ duration: known.has(c.id) ? 0 : 220 }}>
      <div class="meta">
        {c.noPos ? 'без координат' : 'кв. ' + coordName(c.x, c.y)} · {fmtTimeAt(c.tFound)}{c.noPos ? ' · 🛰️ навигатор сел' : ''}
        {#if c.verdict === 'real'}<span class="vb real">✓ подтверждено</span>
        {:else if c.verdict === 'junk'}<span class="vb junk">✗ не относится</span>
        {:else if c.exp === 'run'}<span class="vb run">🔬 анализ…</span>
        {:else if c.exp === 'wait'}<span class="vb run">в очереди</span>{/if}
      </div>
      <p style="color:var(--txt)">
        {c.text}{#if c.dirShow != null && m === 'real'} <span class="hl">направление: {dirName(c.dirShow)} {dirArrow(c.dirShow)}</span>{/if}
      </p>
      <div class="row">
        <span>
          <button class="btn mini" class:on={c.mark === 'real'} disabled={!!c.verdict}
                  onclick={(e) => { game.mark(c.id, 'real'); (e.currentTarget as HTMLElement).blur(); }}>📌 Улика</button>
          <button class="btn mini" class:on={c.mark === 'junk'} disabled={!!c.verdict}
                  onclick={(e) => { game.mark(c.id, 'junk'); (e.currentTarget as HTMLElement).blur(); }}>🗑 Мусор</button>
        </span>
        {#if canExp}
          <button class="btn mini" disabled={g.funds < EXPCOST} onclick={() => game.expertise(c.id)}>🔬 Экспертиза ({EXPT[g.buildings.tent]} мин · {EXPCOST} ₽)</button>
        {:else if g.buildings.tent < EXP_LVL && !c.verdict}
          <span class="stTxt">🔬 анализ улик — со штаба ур. 3</span>
        {/if}
      </div>
    </div>
  {/each}
{/if}
