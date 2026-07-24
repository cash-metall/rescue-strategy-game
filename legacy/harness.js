'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const GAME=process.argv[2];
let code=fs.readFileSync(GAME,'utf8');

// ---- DOM-заглушка ----
function fakeNode(){
  const n={innerHTML:'',textContent:'',className:'',title:'',value:'',checked:false,
    children:{length:0},firstChild:{remove(){}},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    style:new Proxy({},{get:()=>'',set:()=>true}),dataset:{},
    appendChild(){},remove(){},addEventListener(){},removeEventListener(){},
    querySelector(){return fakeNode();},querySelectorAll(){return [];},
    closest(){return null;},focus(){},setAttribute(){},getAttribute(){return null;}};
  return n;
}
const document={querySelector(){return fakeNode();},querySelectorAll(){return [];},
  createElement(){return fakeNode();},addEventListener(){},body:fakeNode(),
  documentElement:fakeNode(),get activeElement(){return null;}};

const store={};
const localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
const sandbox={document,console,Math,Date,JSON,setTimeout:()=>0,clearTimeout:()=>{},
  setInterval:()=>0,clearInterval:()=>{},location:{reload(){}},localStorage,
  confirm:()=>true};
sandbox.globalThis=sandbox;
sandbox.window=sandbox;

// экспонируем внутренности
code+=`\n;globalThis.__api={get G(){return G}, set G(v){G=v;}, newGame, tryGen, simMinute,
  dispatchUnit, actBuild, actHire, actTrain, cellAt, unitById, travelTime, searchEff,
  activeMissions, inRange, targetable, heatScores, MISSCAP, TENTCAP, RANGE, TYPES, BUILD,
  HQ, W, H, EXPT, EXPS,
  get campaign(){return campaign}, set campaign(v){campaign=v;},
  loadCampaign, saveCampaign, resetCampaign, endGame, foundVictim };`;

vm.createContext(sandbox);
try{ vm.runInContext(code, sandbox, {filename:'game.js'}); }
catch(e){ console.error('LOAD FAIL:', e); process.exit(1); }
const API=sandbox.__api;

// ================= ТЕСТ 1: генерация =================
function chebLocal(a,b){return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));}
let fails=0, lens=[], arts=[], vdist=[], life=[], trailIn5=[], trailIn7=[], trailIn9=[], junkTotal=[];
const DEF=API.campaign; // дефолтная кампания
let campBad=0, campDist=[]; // лагерь: дистанция до ТПК и «пустота»
const N1=5000;
for(let i=0;i<N1;i++){
  let g;
  try{ g=API.tryGen(DEF); }catch(e){ console.error('tryGen threw:',e.message); fails++; continue; }
  if(!g){ fails++; continue; }
  const hq=g.hq;
  // проверка лагеря: 1..3 клетки от ТПК, не на маршруте, без артефактов, не на жертве, не озеро
  const cd=chebLocal(hq,g.lkp);
  campDist.push(cd);
  const cell=g.map[hq.y][hq.x];
  const onTrail=g.trailSet.has(hq.x+','+hq.y);
  const hasArt=cell.objects.some(o=>o.kind==='art');
  const hasJunk=cell.objects.some(o=>o.kind==='junk');
  const isVictim=(hq.x===g.victim.x&&hq.y===g.victim.y);
  if(cd<1||cd>3||onTrail||hasArt||hasJunk||isVictim||cell.terrain!=='base')campBad++;
  lens.push(g.path.length);
  let a=0; for(const row of g.map)for(const c of row)for(const o of c.objects)if(o.kind==='art')a++;
  arts.push(a);
  let jt=0; for(const row of g.map)for(const c of row)for(const o of c.objects)if(o.kind==='junk')jt++;
  junkTotal.push(jt);
  const d=Math.hypot(hq.x-g.victim.x,hq.y-g.victim.y);
  vdist.push(d);
  life.push(100/g.drainBase);
  let in5=0,in7=0,in9=0;
  for(const q of g.path){ const c=chebLocal(hq,q); if(c<=5)in5++; if(c<=7)in7++; if(c<=9)in9++; }
  trailIn5.push(in5/g.path.length);
  trailIn7.push(in7/g.path.length);
  trailIn9.push(in9/g.path.length);
  // проверка границ/консистентности
  if(g.victim.x<0||g.victim.x>=API.W||g.victim.y<0||g.victim.y>=API.H){console.error('victim OOB');}
}
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const min=a=>Math.min(...a), max=a=>Math.max(...a);
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(p*s.length)];};
console.log('=== ТЕСТ 1: генерация ('+N1+' попыток) ===');
console.log('  провалов tryGen:', fails, '('+(100*fails/N1).toFixed(2)+'%)');
console.log('  длина пути: min',min(lens),'avg',avg(lens).toFixed(1),'max',max(lens));
console.log('  артефактов: min',min(arts),'avg',avg(arts).toFixed(1),'max',max(arts));
console.log('  мусора всего: avg',avg(junkTotal).toFixed(1));
console.log('  дистанция HQ→жертва: min',min(vdist).toFixed(1),'avg',avg(vdist).toFixed(1),'max',max(vdist).toFixed(1));
console.log('  жизнь жертвы (мин): min',min(life).toFixed(0),'avg',avg(life).toFixed(0),'max',max(life).toFixed(0));
console.log('  доля тропы в радиусе 5 (старт): avg',(100*avg(trailIn5)).toFixed(0)+'%, полностью покрыто у',(100*trailIn5.filter(x=>x>=0.999).length/trailIn5.length).toFixed(0)+'% карт');
console.log('  доля тропы в радиусе 7 (radio-1): avg',(100*avg(trailIn7)).toFixed(0)+'%, полностью покрыто у',(100*trailIn7.filter(x=>x>=0.999).length/trailIn7.length).toFixed(0)+'% карт');
console.log('  доля тропы в радиусе 9 (radio-1): avg',(100*avg(trailIn9)).toFixed(0)+'%, полностью у',(100*trailIn9.filter(x=>x>=0.999).length/trailIn9.length).toFixed(0)+'% карт');
console.log('  ЛАГЕРЬ: дистанция до ТПК min',min(campDist),'avg',avg(campDist).toFixed(2),'max',max(campDist),'| нарушений размещения:',campBad);

// ================= ТЕСТ 2: авто-игрок (баланс/winnability + отсутствие исключений) =================
function playGame(strategy){
  API.resetCampaign();
  API.newGame(API.campaign);
  const G=API.G;
  G.paused=false;
  let lastDecision=-999, buildStep=0;
  const buildPlan=['carto','rest','radio']; // ранние покупки
  const MAXT=6000;
  let err=null;
  try{
    while(!G.over && G.t<MAXT){
      // ранний менеджмент штаба и найм
      if(G.t-lastDecision>=10){
        lastDecision=G.t;
        // покупки по плану, если хватает денег
        if(strategy!=='naive'){
          // нанять пеших до вместимости
          while(G.units.length<API.TENTCAP[G.buildings.tent] && G.funds>=API.TYPES.foot.cost && G.units.length<4){
            API.actHire('foot');
          }
          // апгрейд шатра для места, если денег вдоволь
          if(G.buildings.tent<2 && G.funds>300) API.actBuild('tent');
          if(buildStep<buildPlan.length){
            const key=buildPlan[buildStep];
            const cur=G.buildings[key], cost=API.BUILD[key].costs[cur+1];
            if(cur<API.BUILD[key].max && G.funds>=cost){ API.actBuild(key); buildStep++; }
          }
        }
        // пометить все находки идеально (компетентный игрок)
        for(const c of G.clues){ if(!c.verdict){ c.mark = c.kind==='art'?'real':'junk'; } }
        // отправить свободные отряды
        const heat=API.heatScores();
        const targeted=new Set(G.units.filter(u=>u.mission).map(u=>u.mission.x+','+u.mission.y));
        for(const u of G.units){
          if(u.status!=='idle')continue;
          if(u.type!=='drone' && u.fatigue>=85)continue;
          if(u.type==='drone' && u.fatigue>60)continue;
          if(API.activeMissions()>=API.MISSCAP[G.buildings.radio])break;
          // выбрать лучшую клетку
          let best=null,bestScore=-1;
          for(let y=0;y<API.H;y++)for(let x=0;x<API.W;x++){
            const cell=API.cellAt(x,y);
            if(!API.targetable(cell)||!API.inRange(cell))continue;
            if(cell.coverage>=75)continue;
            if(targeted.has(x+','+y))continue;
            let s=heat[y][x];
            if(strategy==='naive'){ s=1/(1+Math.hypot(x-G.lkp.x,y-G.lkp.y)); }
            // штраф за дальность (время)
            const tt=API.travelTime(u,cell);
            s=s - tt*0.0006;
            if(s>bestScore){bestScore=s;best=cell;}
          }
          if(best){ API.dispatchUnit(u,best); targeted.add(best.x+','+best.y); }
        }
      }
      API.simMinute();
    }
  }catch(e){ err=e; }
  return {win:G.over&&G.over.win, t:G.t, strength:G.victim.strength, spent:G.spent,
          units:G.units.length, err, timeout:!G.over};
}

for(const strat of ['smart','naive']){
  let wins=0, tsum=0, ssum=0, timeouts=0, errors=0, n=250;
  const errSamples=[];
  for(let i=0;i<n;i++){
    const r=playGame(strat);
    if(r.err){errors++; if(errSamples.length<3)errSamples.push(r.err.stack||r.err.message);}
    else if(r.win){wins++; tsum+=r.t; ssum+=r.strength;}
    else if(r.timeout)timeouts++;
  }
  console.log('\n=== ТЕСТ 2: авто-игрок ['+strat+'] ('+n+' партий) ===');
  console.log('  побед:', wins, '('+(100*wins/n).toFixed(0)+'%), поражений по таймеру симуляции:', timeouts, ', исключений:', errors);
  if(wins)console.log('  при победе: среднее время', (tsum/wins).toFixed(0),'мин ('+((tsum/wins)/60).toFixed(1)+' ч), остаток сил', (ssum/wins).toFixed(0)+'%');
  if(errSamples.length)console.log('  ПРИМЕР ИСКЛЮЧЕНИЯ:\n', errSamples[0]);
}
// ================= ТЕСТ 3: перенос штаба между делами =================
console.log('\n=== ТЕСТ 3: перенос штаба между делами (кампания) ===');
API.resetCampaign();
API.newGame(API.campaign);
let g=API.G; g.funds=100000;
API.actBuild('radio'); API.actBuild('radio'); // radio2
API.actBuild('tent');                          // tent2
API.actBuild('train');                         // train1
API.actHire('foot');                           // ростер 3
const beforeUnits=g.units.length;
const u=g.units[0];
API.actTrain(u.id);
for(let i=0;i<200 && u.status==='train';i++)API.simMinute();
const trainedLevel=u.level;
const oldLkp=g.lkp.x+','+g.lkp.y, oldVictim=g.victim.x+','+g.victim.y;
API.foundVictim(g.units.find(x=>x.status==='idle')||g.units[0]); // победа -> endGame -> сохранение
const savedRaw=store['rescueHQ.campaign.v1'];
API.newGame(API.campaign);                     // следующее дело
const g2=API.G;
const chk=[
  ['радиостанция ур.2 сохранена', g2.buildings.radio===2],
  ['шатёр ур.2 сохранён', g2.buildings.tent===2],
  ['учебный центр ур.1 сохранён', g2.buildings.train===1],
  ['ростер перенесён ('+g2.units.length+' отр.)', g2.units.length===beforeUnits],
  ['обучение сохранено (ур.'+trainedLevel+')', trainedLevel===2 && g2.units.some(x=>x.level===2)],
  ['усталость/статус сброшены', g2.units.every(x=>x.fatigue===0&&x.status==='idle'&&!x.mission)],
  ['новая локация', (g2.lkp.x+','+g2.lkp.y)!==oldLkp || (g2.victim.x+','+g2.victim.y)!==oldVictim],
  ['статистика: 1 победа', API.campaign.stats.won===1 && API.campaign.stats.lost===0],
  ['бюджет свежий (250)', g2.funds===250],
  ['сохранение записано в localStorage', typeof savedRaw==='string' && savedRaw.length>0],
];
for(const [name,ok] of chk)console.log('  ['+(ok?'OK':'FAIL')+'] '+name);
// сброс кампании
API.resetCampaign();
const cleared=store['rescueHQ.campaign.v1']===undefined;
const dc=API.campaign;
console.log('  ['+(cleared?'OK':'FAIL')+'] «Новая игра» очищает сохранение');
console.log('  ['+(dc.buildings.radio===0&&dc.buildings.tent===1&&dc.roster.length===2?'OK':'FAIL')+'] после сброса — дефолтный штаб (1 шатёр, 2 отряда)');

console.log('\nГОТОВО');
