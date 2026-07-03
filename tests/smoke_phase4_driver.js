// ===== SMOKE TEST : exécution réelle de runPhase4CoreLoop_Ultimate_ =====
const headers = ['ID_ELEVE','NOM','SEXE','LV2','OPT','COM','TRA','PART','ABS','DISSO','ASSO','CLASSE_IMPOSEE','MOBILITE','FIXE'];
let nextId = 0;
const allData = [];
const byClass = {'3°1': [], '3°2': [], '3°3': []};
function mk(cls, sexe, com, tra, opt, mob) {
  const id = nextId++;
  const row = ['E'+id, 'ELEVE'+id, sexe, 'ESP', opt, com, tra, 3, 3, '', '', '', mob, mob === 'FIXE' ? 'OUI' : 'NON'];
  const scoreMoy = (com + tra + 3) / 3;
  const st = { row, index: id, sexe, COM: com, TRA: tra, PART: 3, ABS: 3,
    opt: opt, lv2: 'ESP', mobilite: mob,
    isHead: (com >= 4 || tra >= 4) || scoreMoy >= 3.5, isNiv1: (com <= 1 || tra <= 1) };
  allData.push(st); byClass[cls].push(id);
  return st;
}
// 3°1 : riche en têtes — 4 têtes LATIN (bloquées à 3°1/3°2) + 4 têtes libres + 10 moyens + 2 fragiles
for (let i = 0; i < 4; i++) mk('3°1', i % 2 ? 'F' : 'M', 5, 4, 'LATIN', 'PERMUT');
for (let i = 0; i < 4; i++) mk('3°1', i % 2 ? 'F' : 'M', 5, 4, '', 'LIBRE');
for (let i = 0; i < 10; i++) mk('3°1', i % 2 ? 'F' : 'M', 3, 3, '', 'LIBRE');
for (let i = 0; i < 2; i++) mk('3°1', 'M', 1, 2, '', 'LIBRE');
// 3°2 : LATIN aussi — 2 têtes LATIN + 1 tête libre + 13 moyens + 4 fragiles
for (let i = 0; i < 2; i++) mk('3°2', 'F', 4, 4, 'LATIN', 'PERMUT');
mk('3°2', 'M', 5, 5, '', 'LIBRE');
for (let i = 0; i < 13; i++) mk('3°2', i % 2 ? 'F' : 'M', 3, 3, '', 'LIBRE');
for (let i = 0; i < 4; i++) mk('3°2', 'M', 1, 1, '', 'LIBRE');
// 3°3 : la « classe ghetto » — 0 tête, 6 fragiles, 14 moyens, dont 2 FIXE
for (let i = 0; i < 6; i++) mk('3°3', i % 2 ? 'F' : 'M', 1, 2, '', 'LIBRE');
for (let i = 0; i < 12; i++) mk('3°3', i % 2 ? 'F' : 'M', 3, 3, '', 'LIBRE');
for (let i = 0; i < 2; i++) mk('3°3', 'F', 3, 3, '', 'FIXE');

const ctx = {
  targets: {'3°1': 20, '3°2': 20, '3°3': 20},
  quotas: {'3°1': {LATIN: 10}, '3°2': {LATIN: 10}, '3°3': {}},
  lv2Universelles: ['ESP']
};
const config = getUltimateConfig_(ctx);
const globalStats = calculateGlobalStats_Ultimate(allData);
const rng = createRNG(42);

function totalScore(bc) {
  let t = 0; for (const c in bc) t += calculateScore_Ultimate(bc[c], allData, globalStats, c, ctx, config);
  return t;
}
function headsOf(cls, bc) { return bc[cls].filter(i => allData[i].isHead).length; }
function classOf(idx, bc) { for (const c in bc) if (bc[c].indexOf(idx) >= 0) return c; return null; }

const initialClass = {}; allData.forEach((s, i) => { initialClass[i] = classOf(i, byClass); });
const before = totalScore(byClass);
const headsBefore = {'3°1': headsOf('3°1', byClass), '3°2': headsOf('3°2', byClass), '3°3': headsOf('3°3', byClass)};

const t0 = Date.now();
const result = runPhase4CoreLoop_Ultimate_(allData, byClass, headers, globalStats, ctx, config, rng);
const elapsed = Date.now() - t0;

const after = totalScore(byClass);
const headsAfter = {'3°1': headsOf('3°1', byClass), '3°2': headsOf('3°2', byClass), '3°3': headsOf('3°3', byClass)};

// ===== ASSERTIONS =====
const errors = [];
if (after > before + 1e-9) errors.push(`Score dégradé : ${before.toFixed(1)} → ${after.toFixed(1)}`);
allData.forEach((s, i) => {
  if (s.mobilite === 'FIXE' && classOf(i, byClass) !== initialClass[i])
    errors.push(`Élève FIXE ${i} déplacé de ${initialClass[i]} vers ${classOf(i, byClass)} !`);
  if (s.opt === 'LATIN') {
    const c = classOf(i, byClass);
    if (!(ctx.quotas[c] && ctx.quotas[c].LATIN > 0)) errors.push(`LATIN ${i} placé en ${c} (pas de quota LATIN) !`);
  }
});
for (const c in byClass) if (byClass[c].length !== 20) errors.push(`Effectif ${c} = ${byClass[c].length} ≠ 20`);
const dups = new Set(); let dupFound = false;
for (const c in byClass) byClass[c].forEach(i => { if (dups.has(i)) dupFound = true; dups.add(i); });
if (dupFound || dups.size !== allData.length) errors.push('Élève dupliqué ou perdu !');

console.log('===== SMOKE TEST MOTEUR (60 élèves, 3 classes) =====');
console.log(`Durée boucle cœur : ${elapsed} ms | swaps: ${result.swapsApplied} (dont 3-way: ${result.swaps3Way})`);
console.log(`Score global : ${before.toFixed(1)} → ${after.toFixed(1)} (${((1 - after / before) * 100).toFixed(1)}% de réduction)`);
console.log(`Têtes 3°1 : ${headsBefore['3°1']} → ${headsAfter['3°1']} | 3°2 : ${headsBefore['3°2']} → ${headsAfter['3°2']} | 3°3 (ghetto) : ${headsBefore['3°3']} → ${headsAfter['3°3']}`);
if (headsAfter['3°3'] <= headsBefore['3°3']) console.log('⚠️ ATTENTION : la classe ghetto n\'a pas gagné de tête');
if (errors.length) { console.log('❌ ÉCHECS :'); errors.forEach(e => console.log('  - ' + e)); process.exit(1); }
console.log('✅ TOUTES LES INVARIANTS RESPECTÉS (FIXE immobiles, LATIN dans classes LATIN, effectifs, unicité)');
