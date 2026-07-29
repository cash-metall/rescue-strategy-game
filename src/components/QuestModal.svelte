<script lang="ts">
  import { game } from '../state/game.svelte';
  import Modal from './Modal.svelte';
  import { QUEST } from '../engine';

  const g = $derived(game.g);
  const q = $derived(g.quest);
  const step = $derived(q ? QUEST[q.step] : null);
  const p = $derived(g.profile);
</script>

{#if q && step}
  <Modal>
    <h2>🩹 Первая помощь · шаг {q.step + 1} из {QUEST.length}</h2>
    <p>{p.face} <b>{p.name}</b> {p.gen === 'f' ? 'найдена живой' : 'найден живым'}, но медики уже уехали. Дальше — вы.</p>
    <p class="mut">{step.q}</p>
    <div class="qopts">
      {#each step.opts as o, i (i)}
        <button class="btn" onclick={() => game.answerQuest(i)}>{o.text}</button>
      {/each}
    </div>
    <p class="mut" style="margin-top:12px">От верных решений зависит итоговый счёт.</p>
  </Modal>
{/if}

<style>
  .qopts { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .qopts :global(.btn) { text-align: left; white-space: normal; line-height: 1.35; }
</style>
