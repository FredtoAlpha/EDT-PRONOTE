// ===== TEST À L'ÉCHELLE : 180 élèves, 6 classes, 5 restarts × 3 cross-phase =====
const headers = ['ID_ELEVE','NOM','SEXE','LV2','OPT','COM','TRA','PART','ABS','DISSO','ASSO','CLASSE_IMPOSEE','MOBILITE','FIXE'];
let nextId = 0; const allData = []; const byClass = {};
let rs = 7; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const CLASSES = ['3°1','3°2','3°3','3°4','3°5','3°6'];
CLASSES.forEach(c => byClass[c] = []);
function mk(cls, com, tra, opt, mob) {
  const id = nextId++;
  const sexe = rnd() < 0.48 ? 'F' : 'M';
  const row = ['E'+id,'EL'+id,sexe,'ESP',opt,com,tra,1+Math.floor(rnd()*5),1+Math.floor(rnd()*5),'','','',mob,mob==='FIXE'?'OUI':'NON'];
  const part = row[7];
  const st = {row,index:id,sexe,COM:com,TRA:tra,PART:part,ABS:row[8],opt,lv2:'ESP',mobilite:mob,
    isHead:(com>=4||tra>=4)||((com+tra+part)/3>=3.5), isNiv1:(com<=1||tra<=1)};
  allData.push(st); byClass[cls].push(id);
}
// Distribution déséquilibrée typique : options aspirent les bons dans 3°1-3°3
CLASSES.forEach((cls, ci) => {
  for (let i = 0; i < 30; i++) {
    const optioned = ci < 3 && i < 10;          // LATIN/GREC dans 3 classes
    const good = optioned || (ci < 3 && rnd() < 0.35) || rnd() < 0.15;
    const weak = !good && (ci >= 3 ? rnd() < 0.3 : rnd() < 0.1);
    const com = good ? 4 + Math.round(rnd()) : weak ? 1 + Math.round(rnd()*0.6) : 2 + Math.floor(rnd()*2);
    const tra = good ? 4 + Math.round(rnd()) : weak ? 1 + Math.round(rnd()) : 2 + Math.floor(rnd()*2);
    const opt = optioned ? (i < 5 ? 'LATIN' : 'GREC') : '';
    const mob = rnd() < 0.08 ? 'FIXE' : (optioned ? 'PERMUT' : 'LIBRE');
    mk(cls, Math.min(5, com), Math.min(5, tra), opt, mob);
  }
});
const ctx = { targets: {}, quotas: {'3°1':{LATIN:12,GREC:12},'3°2':{LATIN:12,GREC:12},'3°3':{LATIN:12,GREC:12},'3°4':{},'3°5':{},'3°6':{}}, lv2Universelles: ['ESP'] };
CLASSES.forEach(c => ctx.targets[c] = 30);
const config = getUltimateConfig_(ctx);
const globalStats = calculateGlobalStats_Ultimate(allData);
function totalScore(bc){let t=0;for(const c in bc)t+=calculateScore_Ultimate(bc[c],allData,globalStats,c,ctx,config);return t;}
function heads(bc){return CLASSES.map(c=>bc[c].filter(i=>allData[i].isHead).length);}
function snap(bc){const o={};for(const c in bc)o[c]=bc[c].slice();return o;}

console.log('Têtes avant   :', heads(byClass).join(' / '), '| score', totalScore(byClass).toFixed(0));
const t0 = Date.now();
// Simule le PIPELINE COMPLET : 3 boucles cross-phase × 5 restarts
let best = null, bestScore = Infinity;
for (let cp = 0; cp < 3; cp++) {
  for (let r = 0; r < 5; r++) {
    const bc = snap(best || byClass);
    const rng = createRNG(1000 * cp + r * 7919);
    runPhase4CoreLoop_Ultimate_(allData, bc, headers, globalStats, ctx, config, rng);
    const s = totalScore(bc);
    if (s < bestScore) { bestScore = s; best = snap(bc); }
  }
}
const ms = Date.now() - t0;
console.log('Têtes après   :', heads(best).join(' / '), '| score', bestScore.toFixed(0));
console.log(`DURÉE TOTALE (15 runs complets = pipeline entier) : ${(ms/1000).toFixed(1)} s`);
// invariants
let err = 0;
allData.forEach((s,i)=>{ const c = CLASSES.find(c=>best[c].indexOf(i)>=0);
  if (s.opt==='LATIN'||s.opt==='GREC') { if(!(ctx.quotas[c]&&ctx.quotas[c][s.opt]>0)) { err++; } } });
CLASSES.forEach(c=>{ if(best[c].length!==30) err++; });
console.log(err === 0 ? '✅ Invariants OK (options, effectifs)' : `❌ ${err} violations !`);
