/**
 * Tests_Score.gs — Tests du socle scoring, lances DANS l'editeur Apps Script.
 *
 * Non deploye (tests/ est exclu du push clasp via .claspignore). A coller
 * temporairement dans un projet de test, ou executer la logique pure via
 * tests/run_tests.js cote Node. Lancer runTestsScore() et lire les logs.
 */

function runTestsScore() {
  var pass = 0, fail = 0, erreurs = [];
  function eq(a, b, msg) {
    if (a === b) { pass++; }
    else { fail++; erreurs.push(msg + ' (attendu ' + b + ', obtenu ' + a + ')'); }
  }

  // Mapping lettre -> score (A-E et transition A-C)
  eq(letterToScore('A'), 5, 'A=5');
  eq(letterToScore('E'), 1, 'E=1');
  eq(letterToScore('c'), 3, 'minuscule');
  eq(letterToScore(''), null, 'vide -> null');
  eq(letterToScore('Z'), null, 'inconnu -> null');

  // Libelles + helpers
  eq(scoreLibelle(3), 'A consolider', 'libelle 3');
  eq(isEnDifficulte(2), true, 'difficulte <=2');
  eq(isEnDifficulte(3), false, 'pas difficulte a 3');
  eq(isExcellent(4), true, 'excellent >=4');

  // Composite (AHUTU du CSV reel : A/A/E/C)
  var comp = scoreComposite({ TRA: 5, COM: 5, ABS: 1, PART: 3 });
  eq(Math.round(comp * 100) / 100, 3.8, 'composite AHUTU = 3.8');

  // Niveau unifie
  eq(normalizeNiveau('6°'), '6e', '6 degre -> 6e');
  eq(normalizeNiveau('3EME'), '3e', 'MEF -> 3e');

  // Matieres
  eq(getMatieres('6e').length > 0, true, '6e a des matieres');

  Logger.log('Tests_Score : ' + pass + ' OK, ' + fail + ' KO');
  if (fail) Logger.log('Echecs:\n - ' + erreurs.join('\n - '));
  return { pass: pass, fail: fail, erreurs: erreurs };
}
