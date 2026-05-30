/**
 * Runner de tests Node pour le socle scoring (Sprint 1).
 * Charge les modules src/*.gs (exports module.exports garde-fou) et verifie
 * la logique PURE hors Apps Script.
 *
 *   node tests/run_tests.js
 *
 * Ne teste PAS les wrappers qui touchent SpreadsheetApp (couverts cote GAS
 * par tests/Tests_Score.gs, lances dans l'editeur Apps Script).
 */
'use strict';
const path = require('path');
const SRC = path.join(__dirname, '..');

const Score = require(path.join(SRC, 'Score.gs'));
const Config = require(path.join(SRC, 'Config.gs'));
const Matieres = require(path.join(SRC, 'Matieres.gs'));
const Seuils = require(path.join(SRC, 'ScoreSeuils.gs'));

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, (msg || '') + ' (attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a) + ')'); }
function approx(a, b, msg) { ok(Math.abs(a - b) < 1e-9, (msg || '') + ' (attendu ~' + b + ', obtenu ' + a + ')'); }

// --- Score : mapping lettre -> score (A-E ET A-C en transition) ---
eq(Score.letterToScore('A'), 5, 'A=5');
eq(Score.letterToScore('B'), 4, 'B=4');
eq(Score.letterToScore('C'), 3, 'C=3');
eq(Score.letterToScore('D'), 2, 'D=2');
eq(Score.letterToScore('E'), 1, 'E=1');
eq(Score.letterToScore('a'), 5, 'minuscule toleree');
eq(Score.letterToScore('  B '), 4, 'espaces tolerees');
eq(Score.letterToScore(''), null, 'vide -> null');
eq(Score.letterToScore(null), null, 'null -> null');
eq(Score.letterToScore('Z'), null, 'inconnu -> null');
// Transition : un fichier A/B/C seul = sous-ensemble du mapping 5 niveaux
eq(Score.letterToScore('C'), 3, 'transition A/B/C -> C reste 3');
// Mapping override (ex: A/B/C projete sur 5/3/1)
eq(Score.letterToScore('B', { A: 5, B: 3, C: 1 }), 3, 'mapping parametrable');

// --- Score : inverse + libelles ---
eq(Score.scoreToLetter(5), 'A', 'score 5 -> A');
eq(Score.scoreLibelle(5), 'Ideal', 'libelle 5');
eq(Score.scoreLibelle(1), "Priorite d'accompagnement", 'libelle 1');
eq(Score.scoreLibelle(99), '', 'libelle hors echelle -> vide');

// --- Score : helpers difficulte / excellence (bornes) ---
eq(Score.isEnDifficulte(2), true, 'score 2 en difficulte');
eq(Score.isEnDifficulte(3), false, 'score 3 PAS en difficulte');
eq(Score.isExcellent(4), true, 'score 4 excellent');
eq(Score.isExcellent(3), false, 'score 3 PAS excellent');
eq(Score.isEnDifficulte(null), false, 'null pas en difficulte');
eq(Score.isScoreValide(0), false, '0 hors echelle');
eq(Score.isScoreValide(6), false, '6 hors echelle');

// --- Score composite : pondere + renormalisation criteres manquants ---
// AHUTU (ligne 3 du CSV reel) : TRA=A(5) COM=A(5) ABS=E(1) PART=C(3)
const ahutu = { TRA: 5, COM: 5, ABS: 1, PART: 3 };
const w = Score.POIDS_CRITERES_DEFAULT; // TRA .40 COM .25 ABS .25 PART .10
const attendu = (5 * .40 + 5 * .25 + 1 * .25 + 3 * .10) / (.40 + .25 + .25 + .10);
approx(Score.scoreComposite(ahutu), attendu, 'composite AHUTU');
approx(Score.scoreComposite(ahutu), 3.8, 'composite AHUTU = 3.8');
// Critere manquant : renormalisation sur les presents
approx(Score.scoreComposite({ TRA: 4, COM: 4 }), 4, 'composite 2 criteres egaux = 4');
eq(Score.scoreComposite({}), null, 'aucun critere -> null');
eq(Score.scoreComposite({ TRA: null, COM: null }), null, 'tous null -> null');

// --- Config : normalisation niveau (UNE fonction, format "6e") ---
eq(Config.normalizeNiveau('6e'), '6e', '6e');
eq(Config.normalizeNiveau('6°'), '6e', '6 degre -> 6e');
eq(Config.normalizeNiveau('6EME'), '6e', '6EME -> 6e');
eq(Config.normalizeNiveau('3EME'), '3e', 'MEF 3EME -> 3e');
eq(Config.normalizeNiveau('5ème'), '5e', '5eme accent -> 5e');
eq(Config.normalizeNiveau('  4 '), '4e', '4 brut -> 4e');
eq(Config.normalizeNiveau('xx'), null, 'non reconnu -> null');
eq(Config.isNiveauValide('6e'), true, '6e valide');
eq(Config.isNiveauValide('2nde'), false, '2nde hors college');

// --- Matieres : une table, 4 niveaux, 6e sans LV2 ---
eq(Object.keys(Matieres.MATIERES_PAR_NIVEAU).sort().join(','), '3e,4e,5e,6e', '4 niveaux');
eq(Matieres.MATIERES_PAR_NIVEAU['6e'].some(m => m.nom === 'LV2'), false, '6e sans LV2');
eq(Matieres.MATIERES_PAR_NIVEAU['3e'].some(m => m.nom === 'LV2'), true, '3e avec LV2');

// --- Seuils : valeur -> score (mode Pronote-moyennes, echelle 1-5) ---
const sd = Seuils.SCORE_SEUILS_DEFAULT.seuils;
eq(Seuils.valueToScore(18, sd.TRA), 5, 'moyenne 18 -> 5');
eq(Seuils.valueToScore(14.5, sd.TRA), 4, 'moyenne 14.5 -> 4');
eq(Seuils.valueToScore(5, sd.TRA), 1, 'moyenne 5 -> 1');
eq(Seuils.valueToScore(0, sd.COM), 5, '0 incident -> 5');
eq(Seuils.valueToScore(30, sd.COM), 1, '30 incidents -> 1');
eq(Seuils.valueToScore('x', sd.TRA), null, 'non numerique -> null');
// Distribution percentile 5 niveaux somme a 1
const dist = Seuils.SCORE_SEUILS_DEFAULT.percentile.distribution;
approx(Object.keys(dist).reduce((s, k) => s + dist[k], 0), 1, 'distribution percentile somme=1');

// --- Bilan ---
console.log('\nTests socle scoring (Sprint 1) : ' + pass + ' OK, ' + fail + ' KO');
process.exit(fail === 0 ? 0 : 1);
