/**
 * Tests du parser EDT (Sprint 2). Logique pure, executable en Node.
 *   node tests/run_tests_import.js
 *
 * - CSV synthetique committable (noms inventes, AUCUNE donnee reelle) couvrant
 *   tous les cas durs : CSV quote-aware, double en-tete, 3 etats, filtrage
 *   niveau, options (O)/(F)/(X), MEF speciaux, homonymes, contraintes.
 * - Smoke test optionnel sur le CSV reel local (tests/fixtures/*.local.csv),
 *   ignore s'il est absent (RGPD : jamais commite).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Import = require(path.join(__dirname, '..', 'ImportEDT.gs'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, (m || '') + ' (attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a) + ')'); }
function approx(a, b, m) { ok(Math.abs(a - b) < 1e-9, (m || '') + ' (attendu ~' + b + ', obtenu ' + a + ')'); }

// =====================================================================
// CSV synthetique (noms inventes). Reproduit la structure EDT a 18 colonnes.
// =====================================================================
const H1 = 'Nom,Prénom,Né(e) le,Sexe,Ancienne classe,Ancien MEF,Options précédentes,Classe prévisionnelle,MEF prévisionnel,Redoublant prévisionnel,Options prévisionnelles,Critères,,,,Regroupé avec,Séparé de,Verrou';
const H2 = ',,,,,,,,,,,Niveau scolaire,Comportement,Absentéisme,À définir,,,';
const CSV = [
  H1, H2,
  // A : 3e, options avec virgule entre guillemets, scores A/B/C/A
  '"DUPOND","Alice","1/1/2011","F","4A","4EME","ANGLAIS LV1 (O), ESPAGNOL LV2 (O)","","3EME","","ANGLAIS LV1 (O), ESPAGNOL LV2 (O)","A","B","C","A","","",',
  // B : homonyme de A, options vides, tout C
  '"DUPOND","Alice","2/2/2011","F","4B","4EME","","","3EME","","","C","C","C","C","","",',
  // C : ULIS, LV2 italien, option facultative LCA LATIN (F), scores D/E/A/B
  '"MARTIN","Bob","3/3/2011","G","4C","4EME ULIS","ANGLAIS LV1 (O), ITALIEN LV2 (O), LCA LATIN (F)","","3EME","","ANGLAIS LV1 (O), ITALIEN LV2 (O), LCA LATIN (F)","D","E","A","B","","",',
  // D : critere TRA VIDE (cellule presente mais vide)
  '"DURAND","Chloé","4/4/2011","F","4D","4EME","","","3EME","","","","B","A","D","","",',
  // E : MEF previsionnel 4EME -> doit etre FILTRE quand niveau cible = 3e
  '"LEROY","David","5/5/2010","G","3A","3EME","","","4EME","","","A","A","A","A","","",',
  // F : UPE2A + contraintes (regroupe + verrou)
  '"PETIT","Emma","6/6/2011","F","4F","4EME UPE2A","ANGLAIS LV1 (O), ESPAGNOL LV2 (O)","","3EME","","ANGLAIS LV1 (O), ESPAGNOL LV2 (O)","B","B","B","B","DUPOND Alice","","OUI"'
].join('\n');

// --- CSV quote-aware : la virgule dans les options ne casse pas les colonnes ---
const rows = Import.parseCsvText(CSV);
eq(rows.length, 8, 'parseCsvText : 2 en-tetes + 6 eleves');
eq(rows[2].length, 18, 'ligne A a bien 18 colonnes malgre la virgule dans options');
eq(rows[2][6], 'ANGLAIS LV1 (O), ESPAGNOL LV2 (O)', 'champ options reconstitue avec sa virgule');

// --- Detection colonnes (double en-tete) ---
const det = Import.detectColumns(rows[0], rows[1]);
eq(det.absents.length, 0, 'aucune colonne attendue absente');
eq(det.map.TRA, 11, 'TRA en colonne 12 (index 11)');
eq(det.map.PART, 14, 'PART (A definir) en colonne 15 (index 14)');
eq(det.map.VERROU, 17, 'Verrou en colonne 18 (index 17)');
eq(det.map.NE_LE, 2, 'Ne(e) le detecte malgre accents/parentheses');
eq(det.map.NOM, 0, 'Nom != Prenom');
eq(det.map.PRENOM, 1, 'Prenom distinct');

// --- parseMef ---
eq(Import.parseMef('4EME UPE2A').profil, 'UPE2A', 'profil UPE2A');
eq(Import.parseMef('4EME UPE2A').niveau, '4e', 'niveau base UPE2A = 4e');
eq(Import.parseMef('3EME').profil, null, '3EME sans profil');
eq(Import.parseMef('4EME ULIS').profil, 'ULIS', 'profil ULIS');

// --- parseOptions : statuts (O)/(F)/(X) + LV2 + option ---
const opC = Import.parseOptions('ANGLAIS LV1 (O), ITALIEN LV2 (O), LCA LATIN (F)');
eq(opC.lv2, 'ITA', 'LV2 italien');
eq(opC.opt, 'LATIN', 'option LATIN (via LCA)');
eq(opC.options.length, 3, '3 options');
const latin = opC.options.filter(o => o.libelle.indexOf('LATIN') >= 0)[0];
eq(latin.statut, 'F', 'LCA LATIN est facultatif (F)');
const ang = opC.options.filter(o => o.libelle.indexOf('ANGLAIS') >= 0)[0];
eq(ang.statut, 'O', 'ANGLAIS LV1 obligatoire (O)');
eq(Import.parseOptions('').options.length, 0, 'options vides -> []');

// --- parseEdt : niveau cible 3e ---
const res = Import.parseEdt(rows, { niveau: '3e' });
const pf = res.preflight;
eq(pf.total, 6, 'total 6 eleves (lignes non vides)');
eq(pf.filtres, 1, '1 filtre (LEROY, MEF prev 4EME)');
eq(pf.gardes, 5, '5 gardes pour le 3e');
eq(res.eleves.length, 5, '5 eleves parses');
eq(pf.niveauCible, '3e', 'niveau cible 3e');

// 3 etats sur TRA : DURAND a une cellule vide
eq(pf.criteres.TRA.present, 4, 'TRA present chez 4 gardes');
eq(pf.criteres.TRA.vide, 1, 'TRA vide chez DURAND');
eq(pf.criteres.TRA.absent, 0, 'TRA jamais absent (colonne presente)');

// Homonymes : DUPOND Alice x2
eq(pf.homonymes.length, 1, '1 cas d homonymie');
eq(pf.homonymes[0].lignes.join(','), '3,4', 'homonymes lignes 3 et 4');

// Profils speciaux : ULIS + UPE2A
eq(pf.profilsSpeciaux.length, 2, '2 profils speciaux (ULIS + UPE2A)');

// Options remplies/vides parmi les gardes
eq(pf.options.remplies, 3, '3 options remplies (A, C, F)');
eq(pf.options.vides, 2, '2 options vides (B, D)');

// Contraintes
eq(pf.contraintes.regroupe, 1, '1 regroupe (PETIT Emma)');
eq(pf.contraintes.verrou, 1, '1 verrou (PETIT Emma)');

// Eleve A : scores et composite
const a = res.eleves.filter(e => e.nom === 'DUPOND' && e.neLe === '1/1/2011')[0];
eq(a.scores.TRA, 5, 'A : TRA=A=5');
eq(a.scores.COM, 4, 'A : COM=B=4');
eq(a.sexe, 'F', 'A : sexe F');
approx(a.composite, (5 * .40 + 4 * .25 + 3 * .25 + 5 * .10), 'A : composite pondere');

// Eleve C : profil + LV2 + verrou false
const c = res.eleves.filter(e => e.nom === 'MARTIN')[0];
eq(c.profil, 'ULIS', 'C : profil ULIS');
eq(c.lv2, 'ITA', 'C : LV2 ITA');
eq(c.scores.COM, 1, 'C : COM=E=1');
ok(Import.parseEdt(rows, { niveau: '3e' }).eleves.every(e => e.niveau === '3e'), 'tous les gardes en 3e');

// Eleve F : contraintes
const f = res.eleves.filter(e => e.nom === 'PETIT')[0];
eq(f.regroupeAvec, 'DUPOND Alice', 'F : regroupe avec');
eq(f.verrou, true, 'F : verrou actif');

// =====================================================================
// Smoke test optionnel : CSV reel local (ignore si absent / RGPD)
// =====================================================================
const fixture = path.join(__dirname, 'fixtures', 'edt_sample.local.csv');
if (fs.existsSync(fixture)) {
  const realRows = Import.parseCsvText(fs.readFileSync(fixture, 'utf8'));
  const r = Import.parseEdt(realRows, { niveau: '3e' });
  const p = r.preflight;
  eq(p.total, 157, 'CSV reel : 157 eleves');
  eq(p.gardes, 157, 'CSV reel : 157 gardes (tous 3e)');
  eq(p.filtres, 0, 'CSV reel : 0 filtre');
  eq(p.criteres.TRA.present, 157, 'CSV reel : TRA renseigne pour tous');
  eq(p.options.remplies, 139, 'CSV reel : 139 options remplies');
  eq(p.options.vides, 18, 'CSV reel : 18 options vides');
  eq(p.contraintes.regroupe + p.contraintes.separe + p.contraintes.verrou, 0, 'CSV reel : aucune contrainte');
  eq(p.profilsSpeciaux.length, 5, 'CSV reel : 5 profils speciaux (2 UPE2A + 3 ULIS)');
  console.log('  (smoke test CSV reel : 157 eleves parses)');
} else {
  console.log('  (smoke test CSV reel ignore : fixture absente)');
}

console.log('\nTests parser EDT (Sprint 2) : ' + pass + ' OK, ' + fail + ' KO');
process.exit(fail === 0 ? 0 : 1);
