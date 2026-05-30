/**
 * ===================================================================
 * EcritureClasses.gs — Ecriture de la repartition dans le classeur
 * ===================================================================
 *
 * Ecrit un onglet par classe (roster + scores/libelles) + un onglet BILAN
 * (stats par classe). Couche d'integration (SpreadsheetApp), logique deja
 * couverte par les modules purs.
 * ===================================================================
 */

var EN_TETES_CLASSE = ['Nom', 'Prenom', 'Sexe', 'Naissance', 'LV2', 'Option', 'Profil',
  'TRA', 'COM', 'ABS', 'PART', 'Composite', 'Niveau', 'Regroupe avec', 'Separe de', 'Verrou'];

/**
 * Ecrit la repartition. Cree/efface un onglet par classe (prefixe niveau) + BILAN.
 * @param {Object} classesState  { nomClasse: [eleves] }
 * @param {string} niveau
 * @returns {{onglets:string[]}}
 */
function ecrireRepartition(classesState, niveau) {
  var ss = SpreadsheetApp.getActive();
  var prefixe = (niveau || getNiveau()) + ' ';
  var onglets = [];

  Object.keys(classesState).forEach(function (nomClasse) {
    var titre = prefixe + nomClasse;
    var sh = ss.getSheetByName(titre) || ss.insertSheet(titre);
    sh.clear();
    var rows = [EN_TETES_CLASSE];
    classesState[nomClasse].forEach(function (e) {
      var comp = (typeof e.composite === 'number') ? Math.round(e.composite * 100) / 100 : '';
      var libelle = (typeof scoreLibelle === 'function' && typeof e.composite === 'number')
        ? scoreLibelle(Math.round(e.composite)) : '';
      rows.push([
        e.nom, e.prenom, e.sexe, e.neLe || '', e.lv2 || '', e.opt || '', e.profil || '',
        scoreOuVide_(e.scores, 'TRA'), scoreOuVide_(e.scores, 'COM'),
        scoreOuVide_(e.scores, 'ABS'), scoreOuVide_(e.scores, 'PART'),
        comp, libelle, e.regroupeAvec || '', e.separeDe || '', e.verrou ? 'OUI' : ''
      ]);
    });
    sh.getRange(1, 1, rows.length, EN_TETES_CLASSE.length).setValues(rows);
    sh.getRange(1, 1, 1, EN_TETES_CLASSE.length).setFontWeight('bold').setBackground('#6366f1').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    onglets.push(titre);
  });

  ecrireBilan_(ss, classesState, prefixe);
  SpreadsheetApp.flush();
  return { onglets: onglets };
}

function ecrireBilan_(ss, classesState, prefixe) {
  var titre = prefixe + 'BILAN';
  var sh = ss.getSheetByName(titre) || ss.insertSheet(titre);
  sh.clear();
  var head = ['Classe', 'Effectif', 'Filles', 'Garcons', '% Filles', 'Composite moyen', 'En difficulte', 'Excellents'];
  var rows = [head];
  Object.keys(classesState).forEach(function (nom) {
    var s = statsClasse(classesState[nom]);
    rows.push([nom, s.effectif, s.filles, s.garcons,
      Math.round(s.partFilles * 100) + '%', Math.round(s.compositeMoy * 100) / 100,
      s.enDifficulte, s.excellents]);
  });
  sh.getRange(1, 1, rows.length, head.length).setValues(rows);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#0f766e').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
}

function scoreOuVide_(scores, k) {
  if (!scores) return '';
  var v = scores[k];
  return (typeof v === 'number') ? v : '';
}
