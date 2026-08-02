<script lang="ts">
  import { game } from '../state/game.svelte';
  import Modal from './Modal.svelte';
  import { BUILD, TYPES, MAXLVL, lvl, type BuildKey } from '../engine';

  const g = $derived(game.g);
  const st = $derived(game.campaign.stats);
  const buildKeys = Object.keys(BUILD) as BuildKey[];

  function reset() {
    game.askConfirm({
      title: 'Новая игра',
      message: 'Весь прогресс штаба и команд будет удалён. Это необратимо.',
      confirmLabel: 'Сбросить прогресс',
      danger: true,
      onConfirm: () => game.hardReset(),
    });
  }

  // ЧИТ/ОТЛАДКА (временно, для тестов): TODO убрать перед релизом
  let copied = $state('');
  async function copyState() {
    // Set/SvelteSet → массивы, иначе JSON их теряет (trailSet, ui.selUnits)
    const replacer = (_k: string, v: unknown) => (v instanceof Set ? [...v] : v);
    const snap = {
      ts: new Date().toISOString(),
      tNow: game.tNow, paused: game.paused, timeScale: game.timeScale,
      campaign: game.campaign,
      g: game.g,
    };
    const text = JSON.stringify(snap, replacer, 2);
    try {
      await navigator.clipboard.writeText(text);
      copied = 'Скопировано ✓';
    } catch {
      // запасной путь: временное текстовое поле + execCommand
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); copied = 'Скопировано ✓'; }
      catch { copied = 'Не удалось — см. консоль'; console.log(text); }
      ta.remove();
    }
    setTimeout(() => { copied = ''; }, 2000);
  }
</script>

<Modal onbackdrop={() => game.closeModal()}>
  <h2>⚙ Штаб и прогресс</h2>
  <div class="secH">Хроника</div>
  <div class="endstat"><span>✅ Найдены живыми</span><b>{st.alive}</b></div>
  <div class="endstat"><span>🕯️ Найдены погибшими</span><b>{st.dead}</b></div>
  <div class="endstat"><span>✖ Не найдены</span><b>{st.missing}</b></div>

  <div class="secH">Развитие штаба (сохраняется между делами)</div>
  <p class="mut">
    {#each buildKeys as k (k)}
      {BUILD[k].icon} {BUILD[k].name.toLowerCase()} — ур. {g.buildings[k]}/{BUILD[k].max}<br />
    {/each}
  </p>

  <div class="secH">Состав команд</div>
  <p class="mut">
    {#each g.units as u (u.id)}
      {TYPES[u.type].icon} {u.name} — {lvl(u.type, u.level).name} ({'★'.repeat(u.level)}{'☆'.repeat(MAXLVL - u.level)}){#if u.away} · выбыл{/if}<br />
    {/each}
  </p>

  <div class="secH">Управление</div>
  <p class="mut">Прогресс хранится в этом браузере. «Новая игра» полностью обнулит штаб и команды и начнёт первое дело заново.</p>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
    <button class="btn primary" onclick={() => game.closeModal()}>Закрыть</button>
    <button class="btn danger" onclick={reset}>Новая игра (сбросить прогресс)</button>
  </div>
  <!-- ЧИТ/ОТЛАДКА (временно, для тестов): TODO убрать перед релизом -->
  <div style="display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin-top:10px">
    <button class="btn mini" onclick={() => { g.funds += 1000; }}>🐞 +1000 ₽</button>
    <button class="btn mini" onclick={copyState}>📋 Скопировать стейт игры</button>
    {#if copied}<span class="mut" style="font-size:12px">{copied}</span>{/if}
  </div>
</Modal>
