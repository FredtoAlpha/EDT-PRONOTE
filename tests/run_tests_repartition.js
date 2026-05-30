/**
 * Tests du moteur de repartition (Sprint 3). Pur, executable en Node.
 *   node tests/run_tests_repartition.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', 'src', 'Repartition.gs'));
const Import = require(path.join(__dirname, '..', 'src', 'ImportEDT.gs'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, (m || '') + ' (attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a) + ')'); }

// Generateur d'eleves synthetiques (noms inventes).
function eleve(i, opts) {
  opts = opts || {};
  return Object.assign({
    nom: 'NOM' + i, prenom: 'P' + i,
    sexe: i % 2 === 0 ? 'F' : 'G',
    composite: 1 + (i % 5), // 1..5
    regroupeAvec: '', separeDe: '', verrou: false, classe: null
  }, opts);
}
function effectifs(classes) { return Object.keys(classes).map(n => classes[n].length); }
function classeDe(classes, nom, prenom) {
  for (const c in classes) if (classes[c].some(e => e.nom === nom && e.prenom === prenom)) return c;
  return null;
}

// --- Groupes ASSO (union-find) ---
(() => {
  const els = [eleve(0, { regroupeAvec: 'NOM1 P1' }), eleve(1), eleve(2)];
  const g = R.construireGroupesAsso(els);
  const tailles = g.groupes.map(x => x.length).sort();
  eq(tailles.join(','), '1,2', 'ASSO : un groupe de 2 + un singleton');
})();

// --- Equilibrage de base : 12 eleves -> 3 classes equilibrees ---
(() => {
  const els = []; for (let i = 0; i < 12; i++) els.push(eleve(i));
  const res = R.repartir(els, { nbClasses: 3, capacite: 100 });
  const effs = effectifs(res.classes).sort();
  eq(effs.join(','), '4,4,4', 'effectifs equilibres 4/4/4');
  eq(els.length, 12, '12 eleves');
  ok(res.rapport.coutFinal <= res.rapport.coutInitial + 1e-9, 'cout final <= initial');
  // parite : chaque classe a ~2F/2G
  Object.keys(res.classes).forEach(n => {
    const s = R.statsClasse(res.classes[n]);
    ok(Math.abs(s.filles - s.garcons) <= 2, 'parite raisonnable en ' + n);
  });
})();

// --- VERROU : eleve non deplacable reste dans sa classe ---
(() => {
  const els = []; for (let i = 0; i < 9; i++) els.push(eleve(i));
  els[0].verrou = true; els[0].classe = 'C3';
  const res = R.repartir(els, { nbClasses: 3, capacite: 100 });
  eq(classeDe(res.classes, 'NOM0', 'P0'), 'C3', 'eleve verrouille reste en C3');
})();

// --- ASSO : deux eleves regroupes finissent ensemble ---
(() => {
  const els = []; for (let i = 0; i < 12; i++) els.push(eleve(i));
  els[0].regroupeAvec = 'NOM5 P5';
  const res = R.repartir(els, { nbClasses: 3, capacite: 100 });
  eq(classeDe(res.classes, 'NOM0', 'P0'), classeDe(res.classes, 'NOM5', 'P5'), 'ASSO : NOM0 et NOM5 ensemble');
  eq(res.rapport.conflits.assoCasse.length, 0, 'aucune ASSO cassee');
})();

// --- DISSO : deux eleves separes finissent dans des classes differentes ---
(() => {
  const els = []; for (let i = 0; i < 12; i++) els.push(eleve(i));
  els[1].separeDe = 'NOM2 P2';
  const res = R.repartir(els, { nbClasses: 3, capacite: 100 });
  const c1 = classeDe(res.classes, 'NOM1', 'P1'), c2 = classeDe(res.classes, 'NOM2', 'P2');
  ok(c1 !== c2, 'DISSO : NOM1 et NOM2 separes (' + c1 + ' / ' + c2 + ')');
  eq(res.rapport.conflits.dissoNonResolu.length, 0, 'DISSO resolue');
})();

// --- DISSO impossible -> signalee (3 eleves separes 2 a 2, 1 seule classe) ---
(() => {
  const els = [eleve(1), eleve(2)];
  els[0].separeDe = 'NOM2 P2';
  const res = R.repartir(els, { nbClasses: 1, capacite: 100 });
  ok(res.rapport.conflits.dissoNonResolu.length >= 1, 'DISSO non resoluble signalee');
})();

// --- Repartition reelle : 157 eleves -> 5 classes ---
(() => {
  const fixture = path.join(__dirname, 'fixtures', 'edt_sample.local.csv');
  if (!fs.existsSync(fixture)) { console.log('  (repartition reelle ignoree : fixture absente)'); return; }
  const rows = Import.parseCsvText(fs.readFileSync(fixture, 'utf8'));
  const eleves = Import.parseEdt(rows, { niveau: '3e' }).eleves;
  const res = R.repartir(eleves, { nbClasses: 5, capacite: 35 });
  const effs = effectifs(res.classes);
  const total = effs.reduce((a, b) => a + b, 0);
  eq(total, 157, 'reel : 157 eleves places');
  ok(Math.max(...effs) - Math.min(...effs) <= 1, 'reel : effectifs equilibres a +/-1 (' + effs.join('/') + ')');
  ok(res.rapport.coutFinal <= res.rapport.coutInitial + 1e-9, 'reel : cout final <= initial');
  console.log('  (repartition reelle 157->5 classes :\n' + R.resumeRepartition(res).split('\n').map(l => '   ' + l).join('\n') + ')');
})();

console.log('\nTests moteur repartition (Sprint 3) : ' + pass + ' OK, ' + fail + ' KO');
process.exit(fail === 0 ? 0 : 1);
