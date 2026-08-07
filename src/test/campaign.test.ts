import { describe, it, expect } from 'vitest';
import {
  newGame, simMinute, actBuild, actHire, actTrain, actRetrain, foundVictim, finalizeOver,
  loadCampaign, saveCampaign, resetCampaign, memoryKV, SAVE_KEY, MAXLVL, TYPES,
  DEFAULT_CAMPAIGN, START_FUNDS,
  type Fx, type Game, type CampStats,
} from '../engine';

const noop = (_fx: Fx) => {};
const zero = (): CampStats => ({ alive: 0, dead: 0, missing: 0 });

describe('кампания: перенос штаба между делами', () => {
  it('постройки/ростер/уровень/фонд переносятся, усталость сброшена, локация новая', () => {
    const kv = memoryKV();
    let campaign = loadCampaign(kv);          // дефолт
    let stats = zero();

    const g: Game = newGame(campaign);
    g.funds = 100000;
    actBuild(g, 'radio', noop);               // radio 1 → 2
    actBuild(g, 'radio', noop);               // radio 2 → 3
    actBuild(g, 'tent', noop);                // tent 2
    actBuild(g, 'train', noop);               // train 1
    actHire(g, 'foot', noop);                 // ростер 3
    const beforeUnits = g.units.length;

    // Обучение теперь мгновенное, но забирает группу из дела до следующего поиска.
    const u = g.units[0];
    actTrain(g, u.id, noop);
    expect(u.level).toBe(2);
    expect(u.away).toBe('training');
    const trainedLevel = u.level;

    const oldLkp = g.lkp.x + ',' + g.lkp.y;
    const oldVictim = g.victim.x + ',' + g.victim.y;

    // конец дела находкой + фиксация кампании (то, что делает стор в onCaseEnd)
    const free = g.units.find(x => !x.away) || g.units[0];
    foundVictim(g, free, noop);
    expect(g.over?.outcome).toBe('alive');
    stats = { ...stats, alive: stats.alive + 1 };
    campaign = saveCampaign(kv, g, stats);
    const savedRaw = kv.getItem(SAVE_KEY);

    // следующее дело из сохранённой кампании
    const g2 = newGame(campaign);

    expect(g2.buildings.radio).toBe(3);
    expect(g2.buildings.tent).toBe(2);
    expect(g2.buildings.train).toBe(1);
    expect(g2.units.length).toBe(beforeUnits);
    expect(trainedLevel).toBe(2);
    expect(g2.units.some(x => x.level === 2)).toBe(true);
    // выбывшие возвращаются в строй: away/busyUntil/restNeed живут только внутри дела
    expect(g2.units.every(x => x.fatigue === 0 && x.status === 'idle' && !x.mission)).toBe(true);
    expect(g2.units.every(x => !x.away && x.busyUntil === 0 && x.restNeed === 0)).toBe(true);
    const newLoc = (g2.lkp.x + ',' + g2.lkp.y) !== oldLkp || (g2.victim.x + ',' + g2.victim.y) !== oldVictim;
    expect(newLoc).toBe(true);
    // Фонд отряда переходит в следующее дело: остаток + отчёт по делу. Без этого награда за
    // найденного живым сгорала бы ровно в момент выдачи — дело кончается тем же кадром.
    expect(g2.funds).toBe(g.funds);
    // и отчёт по делу успел начислиться ДО сохранения кампании
    expect(g.over!.payout.outcome).toBeGreaterThan(0);
    expect(g.over!.fundLeft).toBe(g2.funds);
    expect(typeof savedRaw).toBe('string');
    expect((savedRaw as string).length).toBeGreaterThan(0);
  });

  it('пешую группу можно докачать до 4 уровня, остальным закрыт 4-й', () => {
    const kv = memoryKV();
    const g = newGame(loadCampaign(kv));
    g.funds = 100000;
    actBuild(g, 'train', noop); actBuild(g, 'train', noop); actBuild(g, 'train', noop);
    expect(g.buildings.train).toBe(3);
    actBuild(g, 'tent', noop); actBuild(g, 'tent', noop);  // tent 3 — открывает «Ветер»
    actHire(g, 'wind', noop);

    // пешая: 1 → 4 (каждое обучение забирает её из дела, поэтому возвращаем в строй руками)
    const foot = g.units.find(u => u.type === 'foot')!;
    for (let lvl = 2; lvl <= MAXLVL; lvl++) {
      actTrain(g, foot.id, noop);
      expect(foot.level).toBe(lvl);
      foot.away = null;
    }
    expect(foot.level).toBe(4);
    actTrain(g, foot.id, noop);
    expect(foot.level).toBe(4);           // выше 4 некуда

    // «Ветер»: 4-й уровень — резерв, обучение до него закрыто
    const wind = g.units.find(u => u.type === 'wind')!;
    for (let i = 0; i < 5; i++) { actTrain(g, wind.id, noop); wind.away = null; }
    expect(wind.level).toBe(3);
  });

  it('переобучение меняет специализацию: новый тип 1 ур. с новым позывным в следующем деле', () => {
    const kv = memoryKV();
    const g = newGame(loadCampaign(kv));
    g.funds = 100000;
    // учебный центр до ур. 4 (переобучение) и штаб до ур. 2 (кинологи)
    actBuild(g, 'train', noop); actBuild(g, 'train', noop); actBuild(g, 'train', noop); actBuild(g, 'train', noop);
    expect(g.buildings.train).toBe(4);
    actBuild(g, 'tent', noop); // tent 2 — открывает кинологов

    const foot = g.units.find(u => u.type === 'foot')!;
    const oldName = foot.name;
    const fundsBefore = g.funds;
    actRetrain(g, foot.id, 'dog', noop);

    // сразу в текущем деле: тип сменился, уровень 1, выбыла до конца дела, имя новое
    expect(foot.type).toBe('dog');
    expect(foot.level).toBe(1);
    expect(foot.away).toBe('training');
    expect(foot.name).not.toBe(oldName);
    expect(g.funds).toBe(fundsBefore - TYPES.dog.cost); // цена = наём нового

    // следующее дело: боец приходит уже кинологом 1 ур.
    const camp = saveCampaign(kv, g, zero());
    const g2 = newGame(camp);
    expect(g2.units.some(u => u.name === foot.name && u.type === 'dog' && u.level === 1)).toBe(true);
    expect(g2.units.some(u => u.name === oldName)).toBe(false);
  });

  it('переобучение закрыто без учебного центра ур. 4 и без разблокировки типа', () => {
    const kv = memoryKV();
    const g = newGame(loadCampaign(kv));
    g.funds = 100000;
    const foot = g.units.find(u => u.type === 'foot')!;

    // учебка ур. 0 — переобучение недоступно
    actRetrain(g, foot.id, 'dog', noop);
    expect(foot.type).toBe('foot');

    // учебка 4, но штаб ур.1 — коптер (unlock 4) недоступен
    actBuild(g, 'train', noop); actBuild(g, 'train', noop); actBuild(g, 'train', noop); actBuild(g, 'train', noop);
    actRetrain(g, foot.id, 'drone', noop);
    expect(foot.type).toBe('foot');
  });

  it('три категории исходов пишутся раздельно', () => {
    const kv = memoryKV();
    const stats = zero();
    const g = newGame(loadCampaign(kv));
    finalizeOver(g, 'dead', 'Лиса-1');
    expect(g.over?.outcome).toBe('dead');
    stats.dead++;
    const c = saveCampaign(kv, g, stats);
    expect(c.stats).toEqual({ alive: 0, dead: 1, missing: 0 });
    const back = loadCampaign(kv);
    expect(back.stats.dead).toBe(1);
  });

  it('сброс очищает сохранение и возвращает дефолтный штаб', () => {
    const kv = memoryKV();
    const g = newGame(loadCampaign(kv));
    saveCampaign(kv, g, { alive: 3, dead: 1, missing: 2 });
    expect(kv.getItem(SAVE_KEY)).not.toBeNull();

    const def = resetCampaign(kv);
    expect(kv.getItem(SAVE_KEY)).toBeNull();
    expect(def.buildings.radio).toBe(1);
    expect(def.buildings.tent).toBe(1);
    expect(def.roster.length).toBe(2);
    expect(def.stats).toEqual({ alive: 0, dead: 0, missing: 0 });
  });

  it('загрузка битого сохранения даёт дефолт', () => {
    const kv = memoryKV();
    kv.setItem(SAVE_KEY, '{ not valid json');
    const c = loadCampaign(kv);
    expect(c.buildings.tent).toBe(1);
    expect(c.roster.length).toBe(2);
  });

  it('нормализация чинит мусор в сохранении, а не пропускает его', () => {
    const kv = memoryKV();
    kv.setItem(SAVE_KEY, JSON.stringify({
      buildings: { tent: 99, radio: 'abc', carto: -5, rest: 1, train: 1 },
      roster: [
        { type: 'foot', name: 'Лиса-1', level: 77 },
        { type: 'ufo', name: 'НЛО', level: 1 },
        { type: 'dog', name: 'Кинолог-1 · Альма', level: 2 },
      ],
      nameCnt: { foot: 1, dog: 1, wind: 0, drone: 0 },
      stats: { alive: 'x', dead: 2, missing: null },
      funds: 'много',
    }));
    const c = loadCampaign(kv);
    expect(c.buildings.tent).toBe(4);        // клампится к BUILD.tent.max
    expect(c.buildings.radio).toBe(1);       // нечисло → дефолт (радио теперь со старта ур. 1)
    expect(c.buildings.carto).toBe(0);       // отрицательное → 0
    expect(c.roster.length).toBe(2);         // неизвестный тип выброшен
    expect(c.roster[0].level).toBe(MAXLVL);  // уровень клампится
    expect(c.stats).toEqual({ alive: 0, dead: 2, missing: 0 });
    expect(c.funds).toBe(START_FUNDS);       // нечисло → стартовый фонд
  });

  it('отрицательный фонд в сохранении обнуляется, дробный — обрезается', () => {
    const kv = memoryKV();
    const base = DEFAULT_CAMPAIGN();
    kv.setItem(SAVE_KEY, JSON.stringify({ ...base, funds: -500 }));
    expect(loadCampaign(kv).funds).toBe(0);
    kv.setItem(SAVE_KEY, JSON.stringify({ ...base, funds: 812.7 }));
    expect(loadCampaign(kv).funds).toBe(812);
  });
});
