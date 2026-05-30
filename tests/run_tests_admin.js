/**
 * Tests securite admin (Sprint 4). Logique pure.
 *   node tests/run_tests_admin.js
 */
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'Admin.gs'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, (m || '') + ' (attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a) + ')'); }

// --- Politique : les anciens defauts faibles sont REFUSES ---
eq(A.validerForceMotDePasse('admin123').ok, false, 'admin123 refuse (garde-fou)');
eq(A.validerForceMotDePasse('1234').ok, false, '1234 refuse (garde-fou)');
eq(A.validerForceMotDePasse('password').ok, false, 'password refuse');

// --- Politique : regles de force ---
eq(A.validerForceMotDePasse('Abc1').ok, false, 'trop court');
eq(A.validerForceMotDePasse('abcdefghij1').ok, false, 'pas de majuscule');
eq(A.validerForceMotDePasse('ABCDEFGHIJ1').ok, false, 'pas de minuscule');
eq(A.validerForceMotDePasse('Abcdefghijkl').ok, false, 'pas de chiffre');
eq(A.validerForceMotDePasse('Abcdefghij1').ok, true, 'mot de passe robuste accepte');

// --- Generation : robuste et toujours valide ---
const rng = (() => { let s = 42; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
const gen = A.genererMotDePasse(14, rng);
eq(gen.length, 14, 'longueur generee = 14');
eq(A.validerForceMotDePasse(gen).ok, true, 'mot de passe genere est valide');
let tousValides = true;
for (let i = 0; i < 200; i++) if (!A.validerForceMotDePasse(A.genererMotDePasse(14)).ok) tousValides = false;
ok(tousValides, '200 mots de passe generes : tous valides');

// --- Hachage : sel pris en compte, deterministe ---
const fakeHash = s => 'H(' + s + ')';
eq(A.hacherMotDePasse_('secret', 'sel1', fakeHash), 'H(sel1::secret)', 'hash inclut le sel');
ok(A.hacherMotDePasse_('secret', 'sel1', fakeHash) !== A.hacherMotDePasse_('secret', 'sel2', fakeHash), 'sels differents -> hash differents');

console.log('\nTests securite admin (Sprint 4) : ' + pass + ' OK, ' + fail + ' KO');
process.exit(fail === 0 ? 0 : 1);
