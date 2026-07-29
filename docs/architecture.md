# Архитектура

Svelte 5 (руны) + Vite + TypeScript. Три слоя с жёсткой границей: **чистый движок** (`src/engine`),
**реактивный стор** (`src/state`), **компоненты** (`src/components`). Бэкенда нет, зависимостей в
рантайме нет вообще — только devDependencies.

```
index.html → src/main.ts → mount(App)
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
   src/engine/*         src/state/*            src/components/*
   чистый TS,           $state / $derived,     разметка и ввод
   без DOM              Sink → эффекты         читают game напрямую
```

## Два объекта состояния

### `Game` — текущее дело

Объявлен в `engine/types.ts`, создаётся `newGame(camp)` → `tryGen(camp)` на каждое дело:

- `t` — игровое время в минутах (0 = 08:00 первого дня), `funds` / `incAcc` / `spent` — деньги.
- `map[y][x]` — сетка `Cell {x, y, terrain, coverage, shown, objects[], touched?}`:
  `coverage` — правда для движка (лучший из проходов), `shown` — что видит игрок.
- `profile`, `lkp`, `path`, `trailSet`, `victim`, `drainBase`, **`hq`** — пропавший, точка последнего
  контакта, маршрут, множество клеток маршрута, состояние жертвы, скорость падения сил, координаты
  лагеря. **Позиция лагеря живёт только в `g.hq`** — никаких модульных переменных (в легаси была
  `let HQ = {x:5, y:11}`; в движке лагерь выбирается под каждое дело в `tryGen`).
- `buildings{tent,radio,carto,rest,train}`, `units[]`, `clues[]`, `log[]`, `stats`, `over`.
- `expRuns[]` / `expQueue[]` — активные и ожидающие экспертизы.
- **`ui{tab, sel, selUnits, heat, speed}` — состояние интерфейса лежит внутри `Game`.** Стор
  своих полей для вкладки, выбора и скорости не имеет; это сознательный компромисс, позволяющий
  движку менять UI-состояние (например `actSend` вычёркивает отряды из `ui.selUnits`).
- `medicsGone`, `quest`, `sightings` — фаза «медики уехали», мини-квест первой помощи и наводки
  «возможная цель» (см. [outcome.md](outcome.md), [units.md](units.md)).
- Прежнее мёртвое поле `paused` удалено: единственный флаг паузы — `GameStore.paused`.

### `Campaign` — мета-прогресс между делами

`{buildings, roster[{type,name,level}], nameCnt, stats}` в `localStorage` под ключом
`SAVE_KEY = 'rescueHQ.campaign.v1'`. Правила и формат — [campaign.md](campaign.md).

## Чистый движок и порт побочек

`src/engine/` — 12 модулей (`types constants rng util path access events generate sim actions heat
campaign`) плюс `index.ts`-баррель. **Ни одного упоминания `document`, `window` или `localStorage`** — именно поэтому
тесты гоняются в `environment: 'node'` без jsdom.

Три шва, через которые движок общается с внешним миром:

| Шов | Что это | Где |
|---|---|---|
| `KV` | порт хранилища (`getItem/setItem/removeItem`), **первым аргументом** в `loadCampaign(kv)`, `saveCampaign(kv,g,stats)`, `resetCampaign(kv)` | `types.ts`, `campaign.ts` |
| `Sink` | единственный порт эффектов: `Fx = {kind:'toast', text, tone?} \| {kind:'save'}` | `types.ts` |
| `ActionResult` | `{ok, reason?}` — ошибки возвращаются данными, а не исключениями | все `act*` |

Всё остальное движок делает мутацией `g` или записью в `g.log` (`LogLine {t, txt, cls?}` — данные, не
HTML; форматирует их `LogTab`).

Слой доступа `access.ts` — то, чем должны пользоваться UI и тесты вместо чтения полей напрямую:
`cellAt, clueById, unitById, effMark, hourOf, isNight, activeMissions, missionSlots, inRange,
targetable, fatEff, detectEff, coverRate, searchEst, restRate, available, isBusy, needsRest,
freeWinds, windCapacity, windMinutes, planTrip, sendBlock, readsDir, lvlName, awayCount,
unitPositions, travelTime`. Игра идёт **первым аргументом** там, где нужны погода, ночь или `g.hq` —
например `coverRate(g, u, cell)` и `planTrip(g, u, cell, wind)`.

Два новых модуля: `path.ts` — Дейкстра по 8 направлениям с ценой клетки из `PATHCOST` и
проходимостью `WIND_PASS`; `events.ts` — бросок события на задачу и применение последствий
(инциденты передают `pushLog` и колбэк снятия с задачи параметрами, чтобы не заводить циклический
импорт с `sim.ts`).

Случайность централизована в `rng.ts` за подменяемым `rand` (`setRng/resetRng/rnd/ri/rf/pick`). Это
шов детерминизма, и он **используется**: балансный тест и тесты механик подменяют `rand` на
сидированный `mulberry32`, иначе пороги флакуют и «регресс баланса» не отличить от неудачной серии
бросков.

## Стор: реактивность вместо диффинга

Два синглтона, создаваемых при импорте модуля: `game = new GameStore()` (`state/game.svelte.ts`) и
`fx = new FxStore()` (`state/fx.svelte.ts`).

`GameStore` содержит ровно 7 рун-полей:

```ts
campaign = $state<Campaign>(loadCampaign(kv))
g        = $state<Game>(seed(this.campaign))
paused   = $state(true)
modal    = $state<ModalKind>('intro')   // 'intro' | 'settings' | 'results' | 'quest' | null
introStart = $state(true)               // интро как начало дела (true) или как справка
sheet    = $state<'none' | 'cell' | 'tabs'>('none')   // мобильные bottom-sheet
resultsFab = $state(false)
```

и один `$derived`: `heat = $derived(g.ui.heat && g.buildings.carto >= 1 ? heatScores(g) : null)`.
Приватные `pausedBeforeModal` и `overHandled` — намеренно **не** руны: их не читает разметка.

**Ключевой механизм.** `g` — глубокий `$state`-прокси; `simMinute(g, sink)` мутирует его на месте, и
перерисовываются только те компоненты, которые читают изменившееся поле. В `src` нет ни флага
`dirty`, ни `touch()`, ни ручного сравнения DOM-узлов, ни `innerHTML` — всё это осталось в легаси.

`seed()` подменяет `ui.selUnits` на `SvelteSet` — движок типизирует его как обычный `Set`, но UI
нужна реактивность на add/delete.

**Фолбэк хранилища — инлайновая заглушка, а не `memoryKV()`:**
`typeof localStorage !== 'undefined' ? localStorage : {getItem:()=>null, setItem:(){}, removeItem:(){}}`.
`memoryKV()` живёт в движке и используется только тестами.

`FxStore`: `toasts = $state<Toast[]>([])`, `push(text, tone)` добавляет запись с монотонным `id`,
обрезает список до 4 штук и снимает её через 5.2 с. Закрыть тост вручную нельзя — контейнер
`pointer-events: none`, поэтому и метода снятия нет.

## Тик-луп и управление временем

Луп живёт в `App.onMount`, **не в `$effect`**:

```ts
onMount(() => { const id = setInterval(() => game.tick(), 250); return () => clearInterval(id); });
```

- `tick()` выходит сразу при `paused || g.over || modal` — модалка морозит время **самим фактом
  открытия**, `paused` при этом не трогается.
- **Скорость — это число прогонов, а не частота таймера:** `for (let i = 0; i < g.ui.speed; i++)
  simMinute(...)`. 1× / 2× / 4× = 4 / 8 / 16 игровых минут на реальную секунду.
- `setSpeed(s)` заодно снимает пузу (`paused = false`); `pause()` только ставит флаг, `ui.speed` не
  сбрасывает — поэтому `MapHUD` возобновляет игру как `setSpeed(g.ui.speed || 1)`.
- `openModal` запоминает `pausedBeforeModal` только на переходе `null → открыто`, так что вторая
  модалка не затирает запомненное значение. `closeModal` восстанавливает пузу лишь `if (!g.over)`.
- Конец дела ловится внутри тика: `if (g.over && !overHandled) onCaseEnd()`. `onCaseEnd` ставит
  `overHandled`, `paused = true`, инкрементит статистику, сохраняет кампанию и открывает
  `ResultsModal`. Сбрасывается `overHandled` только в `startCase()` — обработчик идемпотентен.

**Чего нет:** ни одного слушателя `visibilitychange`, `blur`, `beforeunload`, `resize` или
`matchMedia`. Симуляция продолжает идти в скрытой вкладке (тормозит только троттлинг браузера), и при
закрытии страницы ничего не сохраняется.

## Дерево компонентов

```
App
├─ .stage
│  ├─ .mapcol → MapHUD, MapGrid → 12×12 MapCell, .cellhost > CellSheet
│  └─ .side   → TabBar, .panelhost > TabPanel → HQTab|UnitsTab|CluesTab|CaseTab|LogTab
│  └─ .backdrop            (только когда открыт sheet)
├─ Toasts, ResultsFab
└─ IntroModal | SettingsModal | ResultsModal | QuestModal   (ровно одна, по game.modal)
```

- **Пропсы принимают только два компонента**: `MapCell` (`cell, far, heat, units, mark, over, zoomed,
  isSearching`) и `Modal` (сниппет `children` + `onbackdrop?`). Все остальные импортируют синглтон
  `game` напрямую — слоя prop-drilling нет.
- `MapHUD` полностью заменил шапку: полоса состояния жертвы, левая пилюля (время, 🌙 ночью, погода,
  ♥ %), правая (₽ и шестерёнка) и поповер шестерёнки с ⏸/1×/2×/4×, «🔥 Карта вероятности»
  (заблокирована при `carto < 1`), «⚙ Штаб и прогресс», «? Справка».
- `MapGrid` — единственный маршрутизатор ввода (см. ниже) и сборщик маркеров: HQ, ТПК и по каждой
  улике (`effMark === 'real'` со стрелкой → `dirArrow`, без стрелки → `◎`, неразмеченная → `•`,
  помеченная мусором — **ничего**). Следы маршрута и жертва добавляются только при `g.over`.
- `MapCell` рисует слоями: `.ter` (топознак) → `.heat` (инлайновая `opacity = heat * 0.5`) →
  `.track` (SVG-змейка покрытия) → `.mk` (маркеры) → `.uu` (иконки отрядов) → `.crd` (координата,
  только при зуме).
- `QuestModal` — мини-квест первой помощи: открывается, когда `g.quest` не пуст (пропавшего нашли
  живым после ухода медиков), и удерживает игру на паузе до последнего ответа.

## Модель ввода на карте

Весь pointer/touch/wheel — в **одном `$effect`** внутри `MapGrid`, нативными слушателями на `wrapEl`.
У `MapCell` нет обработчика клика вообще: попадание определяется на `pointerup` через
`document.elementFromPoint(...).closest('.cell')` и атрибуты `data-cx` / `data-cy`. **Класс `.cell` и
эти data-атрибуты — несущий контракт ввода**, их нельзя переименовать «просто так».

Арбитраж тапа:

| Жест | Порог | Действие |
|---|---|---|
| Одиночный тап | таймер 300 мс | `game.select(cx, cy)` |
| Двойной тап | < 260 мс и < 40 px | отменяет тап, `applyZoom(scale × 2)` |
| Перетаскивание | > 8 px | отменяет тап, панорамирует; следующий «призрачный» `click` глотается слушателем в фазе capture |
| Пинч | два пальца | масштаб по расстоянию + панорама по смещению середины |

Геометрия сетки **постоянна и не зависит от зума**: `CELL_PX = 46`, `GRID_PX = 552`, зум — это
`transform: translate(tx,ty) scale(scale)` на `.gridwrap`. `will-change` там отсутствует намеренно —
иначе Chrome кеширует растр и линии сетки размываются.

Один `ResizeObserver` обновляет `wrapW/wrapH` всегда, но пере-вписывает карту только при изменении
**ширины** больше 0.5 px и только если пользователь не тащит, не пинчует и не зумил вручную.
Изменения высоты (рост bottom-sheet, адресная строка на мобиле) карту не двигают — это осознанно.

Сетка и рамка выбора — SVG-штрихи с `vector-effect: non-scaling-stroke`; у `.cell` нет ни `border`,
ни `outline`, чтобы толщина линий не зависела от масштаба.

## Мобильный и настольный режимы

**Единственный размерный брейкпоинт во всём приложении — `@media (min-width: 900px)` в `App.svelte`.**
Мобильная раскладка — базовая.

- На мобиле `.side { display: contents }`, и `.tabrow` / `.panelhost` / `.cellhost` становятся
  `position: fixed` bottom-sheet'ами.
- **Sheet'ы переключаются классом, а не условным рендером**: `class:open={game.sheet === 'cell'}` →
  `transform: translateY(110%)` ↔ `translateY(0)`. `CellSheet`, `TabPanel` и активная вкладка
  **остаются смонтированными** и продолжают пересчитываться, пока скрыты.
- Свайп вниз для закрытия — локальный Svelte-экшен `swipeDown` в `App.svelte`, навешенный на оба
  sheet'а; он не ограничен медиа-запросом, поэтому работает и на десктопе.
- На десктопе тот же DOM превращается в две колонки без перемонтирования; `.mapcol` обязан сохранить
  `flex: 1; min-width: 0`, иначе ширину колонки начнёт задавать текст `CellSheet` и карта будет
  дёргаться на каждом тике.
- Клавиатура поддержана слабо: у `MapCell` есть `role="button"` + Enter/Space, но `tabindex="-1"`
  делает сетку недостижимой табом; `Modal` фокусирует бокс, но Escape его не закрывает.

## Стили

`main.ts` импортирует `tokens.css`, затем `global.css` — это вся настройка каскада.

- `tokens.css` — ровно 12 переменных `:root` (цвета + `--mono` + `--disp`). **Токенов для отступов,
  радиусов, теней, z-index и брейкпоинта нет** — все они литералы по месту.
- В проекте **две несвязанные палитры**: тёмная токенная для интерфейса и светлая топографическая для
  карты, зашитая литералами в `global.css` (`.t-forest #c8dba8` и т.д.).
- `global.css` не заскоупен намеренно по двум причинам, и обе помечены комментариями: это общий «язык
  карты» для `MapGrid` и `MapCell` (`.cell, .t-*, .ter, .heat, .mk, .uu, .crd`), и правила
  `.modalbox *` должны быть глобальными, потому что контент модалок передаётся в `Modal` сниппетом —
  скоуп родителя до него не достаёт.
- «Язык панелей» (`.card, .row, .secH, .stTxt, .bar, .clue, .btn, .tabbtn` …) тоже в `global.css`,
  потому что **ни у одного файла в `components/tabs/` нет блока `<style>`** — эти имена классов
  являются публичным контрактом.
- Скрытая связь между файлами: `MapGrid` публикует зум как инлайновое `--s` на `.gridwrap`, а
  `global.css` делит на него размеры подписи координат, чтобы та не росла при зуме.
- **У ночи нет ни одного стиля** — `isNight(g)` добавляет только 🌙 в текст HUD. Класса `.night` в
  `src` не существует.
- Лестница z-index трёхъярусная: внутри карты `3 → 4 → 5 → 10`, HUD над картой `11 → 12 → 19 → 20`,
  оболочка `45 → 47 → 48 → 60 → 70 → 100`.

## Инициализация и жизненный цикл дела

`index.html` → `main.ts`: `mount(App, {target: document.getElementById('app')})`. Единственный путь
отказа — `throw new Error('#app not found')`; экрана-заглушки «не удалось развернуть», как в легаси,
**нет**.

Стор конструируется на этапе вычисления модуля, поэтому `loadCampaign` читает `localStorage` и
`seed()` генерирует карту 12×12 **до монтирования любого компонента**. Приложение открывается на
паузе с брифингом (`modal = 'intro'`).

| Переход | Что делает |
|---|---|
| `beginCase()` | `modal = null; paused = false; ui.speed = 1` — старт дела |
| `openHelp()` | `introStart = false` + та же `IntroModal` как справка |
| `onCaseEnd()` | `paused = true`, статистика, `persist()`, `ResultsModal` |
| `showMap()` / `backToResults()` | осмотр завершённой карты; `paused` остаётся `true` |
| `startCase()` | `g = seed(campaign)` — **весь объект заменяется**, все читатели перерисовываются сами |
| `hardReset()` | `resetCampaign(kv)` + `startCase()`, за нативным `confirm` |

Кампания пишется не только в конце дела: движок эмитит `{kind:'save'}` при постройке (`actBuild`),
найме (`actHire`) и обучении (`actTrain` — сразу, обучение мгновенное). В конце дела `onCaseEnd` вызывает `persist()`
**напрямую, минуя `Sink`**.

## Сборка и раздача

- Ноль рантайм-зависимостей; devDeps: svelte 5, vite 5, vitest 2, typescript 5, svelte-check,
  `@sveltejs/vite-plugin-svelte`, `@tsconfig/svelte`.
- **`vite.config.ts` задаёт `base: '/rescue-strategy-game/'`.** Поэтому dev и preview открываются по
  `http://localhost:5173/rescue-strategy-game/` и `:4173/rescue-strategy-game/` — по корню приложение
  не поднимется, и `dist/index.html` нельзя открыть по `file://`.
- Конфиг vitest живёт **внутри `vite.config.ts`** (`test: {environment:'node', include:
  ['src/test/**/*.test.ts']}`), отдельного `vitest.config.*` нет.
- Пути к картинкам считаются двумя разными способами: в CSS — корне-абсолютные `url(/images/…)`
  (Vite ре-базирует при сборке), в компонентах — `import.meta.env.BASE_URL + 'images/'`.
- `dist/` **и лежит в гите** (~20 файлов), **и пересобирается** в `.github/workflows/deploy.yml` на
  каждый push в `main` (Node 24, `npm ci`, `npm run build`, `upload-pages-artifact` → `deploy-pages`).
  Опубликованный сайт всегда из свежей сборки; закоммиченная папка нужна только для ручной передачи.

## Швы для тестов

Три места, через которые движок можно взять под контроль, не поднимая браузер:

| Шов | Как используется |
|---|---|
| `KV` | `memoryKV()` вместо `localStorage` — `campaign.test.ts` проверяет сохранение и нормализацию |
| `Sink` | заглушка `const noop = (_fx: Fx) => {}` заменяет всё стабирование тостов и DOM |
| `setRng`/`resetRng` | балансный прогон и тесты механик идут на сидированном `mulberry32`, поэтому пороги воспроизводимы и «регресс баланса» отличим от неудачной серии бросков |

Время в тестах двигают вызовами `simMinute(g, noop)`, а не таймером: тик-луп живёт в компонентном
слое, который vitest не монтирует. Подробности — [testing.md](testing.md).

Что было удалено при чистке мёртвого кода и почему — в [roadmap.md](roadmap.md) и
[devlog.md](devlog.md).
