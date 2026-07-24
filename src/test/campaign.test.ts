import { describe, it, expect } from 'vitest';
import {
  newGame, simMinute, actBuild, actHire, actTrain, foundVictim,
  loadCampaign, saveCampaign, resetCampaign, memoryKV, SAVE_KEY,
  type Fx, type Game,
} from '../engine';

const noop = (_fx: Fx) => {};

describe('кампания: перенос штаба между делами', () => {
  it('постройки/ростер/обучение переносятся, усталость сброшена, локация новая, бюджет свежий', () => {
    const kv = memoryKV();
    let campaign = loadCampaign(kv);          // дефолт
    let stats = { won: 0, lost: 0 };

    const g: Game = newGame(campaign);
    g.funds = 100000;
    actBuild(g, 'radio', noop);               // radio 1
    actBuild(g, 'radio', noop);               // radio 2
    actBuild(g, 'tent', noop);                // tent 2
    actBuild(g, 'train', noop);               // train 1
    actHire(g, 'foot', noop);                 // ростер 3
    const beforeUnits = g.units.length;

    const u = g.units[0];
    actTrain(g, u.id, noop);
    for (let i = 0; i < 200 && u.status === 'train'; i++) simMinute(g, noop);
    const trainedLevel = u.level;

    const oldLkp = g.lkp.x + ',' + g.lkp.y;
    const oldVictim = g.victim.x + ',' + g.victim.y;

    // конец дела победой + фиксация кампании (то, что делает стор в onCaseEnd)
    const idle = g.units.find(x => x.status === 'idle') || g.units[0];
    foundVictim(g, idle);
    expect(g.over && g.over.win).toBe(true);
    stats = { ...stats, won: stats.won + 1 };
    campaign = saveCampaign(kv, g, stats);
    const savedRaw = kv.getItem(SAVE_KEY);

    // следующее дело из сохранённой кампании
    const g2 = newGame(campaign);

    expect(g2.buildings.radio).toBe(2);
    expect(g2.buildings.tent).toBe(2);
    expect(g2.buildings.train).toBe(1);
    expect(g2.units.length).toBe(beforeUnits);
    expect(trainedLevel).toBe(2);
    expect(g2.units.some(x => x.level === 2)).toBe(true);
    expect(g2.units.every(x => x.fatigue === 0 && x.status === 'idle' && !x.mission)).toBe(true);
    const newLoc = (g2.lkp.x + ',' + g2.lkp.y) !== oldLkp || (g2.victim.x + ',' + g2.victim.y) !== oldVictim;
    expect(newLoc).toBe(true);
    expect(g2.funds).toBe(250);
    expect(typeof savedRaw).toBe('string');
    expect((savedRaw as string).length).toBeGreaterThan(0);
  });

  it('сброс очищает сохранение и возвращает дефолтный штаб', () => {
    const kv = memoryKV();
    const g = newGame(loadCampaign(kv));
    saveCampaign(kv, g, { won: 3, lost: 1 });
    expect(kv.getItem(SAVE_KEY)).not.toBeNull();

    const def = resetCampaign(kv);
    expect(kv.getItem(SAVE_KEY)).toBeNull();
    expect(def.buildings.radio).toBe(0);
    expect(def.buildings.tent).toBe(1);
    expect(def.roster.length).toBe(2);
  });

  it('загрузка битого сохранения даёт дефолт', () => {
    const kv = memoryKV();
    kv.setItem(SAVE_KEY, '{ not valid json');
    const c = loadCampaign(kv);
    expect(c.buildings.tent).toBe(1);
    expect(c.roster.length).toBe(2);
  });
});
