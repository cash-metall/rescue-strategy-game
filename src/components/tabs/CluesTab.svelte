<script lang="ts">
  import { game } from '../../state/game.svelte';
  import { EXPCOST, EXPREWARD, EXPT, coordName, fmtTimeAt, effMark, dirName, dirArrow } from '../../engine';

  const g = $derived(game.g);

  // Пока вкладка открыта, новые улики сразу считаются просмотренными (как в старой игре).
  $effect(() => {
    for (const c of g.clues) if (c.isNew) c.isNew = false;
  });
</script>

{#if !g.clues.length}
  <p class="stTxt">Пока находок нет. Отправляйте группы обследовать квадраты вокруг точки 📍.</p>
{:else}
  <p class="stTxt">Сверяйте находки с приметами во вкладке «Дело» и сами решайте: 📌 улика или 🗑 мусор. Отметка «улика» выводит направление на карту — ошибётесь, поведёте поиск не туда. Экспертиза ({EXPCOST} ₽) даёт точное заключение; за верную догадку вернут {EXPREWARD} ₽.</p>
  {#each g.clues as c (c.id)}
    {@const m = effMark(c)}
    {@const cls = c.verdict === 'real' ? 'vreal' : m === 'real' ? 'mreal' : m === 'junk' ? 'mjunk' : ''}
    {@const canExp = g.buildings.carto >= 1 && !c.exp}
    <div class="card clue {cls}">
      <div class="meta">
        кв. {coordName(c.x, c.y)} · {fmtTimeAt(c.tFound)}{c.photo ? ' · 📷 фото с дрона' : ''}
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
          <button class="btn mini" class:on={c.mark === 'real'} disabled={!!c.verdict} onclick={() => game.mark(c.id, 'real')}>📌 Улика</button>
          <button class="btn mini" class:on={c.mark === 'junk'} disabled={!!c.verdict} onclick={() => game.mark(c.id, 'junk')}>🗑 Мусор</button>
        </span>
        {#if canExp}
          <button class="btn mini" disabled={g.funds < EXPCOST} onclick={() => game.expertise(c.id)}>🔬 Экспертиза ({EXPT[g.buildings.carto]} мин · {EXPCOST} ₽)</button>
        {:else if g.buildings.carto < 1 && !c.verdict}
          <span class="stTxt">🔬 нужен картограф</span>
        {/if}
      </div>
    </div>
  {/each}
{/if}
