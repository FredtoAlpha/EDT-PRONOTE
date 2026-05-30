/**
 * ===================================================================
 * Config.gs — SOURCE UNIQUE de lecture/ecriture _CONFIG + niveau
 * ===================================================================
 *
 * Remplace les DEUX doublons du projet legacy :
 *   - lireNiveauDepuisConfig()  (format "6°")   -> SUPPRIME
 *   - detectNiveauAuto()        (format "6e")   -> SUPPRIME
 * au profit d'UNE seule fonction getNiveau(), format canonique unique "6e".
 *
 * Multi-tenant : chaque spreadsheet porte son niveau dans _CONFIG.NIVEAU.
 * Le meme code se comporte differemment selon ce selecteur, verrouille
 * apres init (NIVEAU_LOCKED).
 *
 * Schema de l'onglet _CONFIG : table cle/valeur en colonnes A (PARAM) / B (VALEUR).
 * ===================================================================
 */

var CONFIG_SHEET_NAME = '_CONFIG';
var NIVEAUX_VALIDES = ['6e', '5e', '4e', '3e'];
var NIVEAU_DEFAUT = '6e';

// =============================================================================
// NORMALISATION NIVEAU (pure, testable)
// =============================================================================

/**
 * Normalise n'importe quelle ecriture de niveau vers le format canonique "Xe".
 * Accepte : "6", "6e", "6E", "6°", "6eme", "6ème", "6EME", "3EME" (MEF), etc.
 * Rend null si non reconnu (l'appelant decide du fallback).
 *
 * @param {*} raw
 * @returns {?string} "6e" | "5e" | "4e" | "3e" | null
 */
function normalizeNiveau(raw) {
  if (raw === null || raw === undefined) return null;
  var s = String(raw).trim();
  if (s === '') return null;
  var m = s.match(/([3-6])/); // premier chiffre 3..6
  if (!m) return null;
  return m[1] + 'e';
}

/** Niveau valide (dans NIVEAUX_VALIDES) ? */
function isNiveauValide(niveau) {
  return NIVEAUX_VALIDES.indexOf(niveau) !== -1;
}

// =============================================================================
// _CONFIG : lecture / ecriture cle-valeur (Apps Script)
// =============================================================================

/** Retourne l'onglet _CONFIG (le cree vide si absent). */
function ensureConfigSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_SHEET_NAME);
    sh.hideSheet();
    sh.getRange(1, 1, 1, 2).setValues([['PARAM', 'VALEUR']])
      .setFontWeight('bold').setBackground('#6366f1').setFontColor('#FFFFFF');
  }
  return sh;
}

/**
 * Lit une valeur de _CONFIG par nom de parametre (colonne A).
 * @param {string} param
 * @param {*} [defaultValue]
 * @returns {*} valeur (string trimmee) ou defaultValue
 */
function configGet(param, defaultValue) {
  if (defaultValue === undefined) defaultValue = null;
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(CONFIG_SHEET_NAME);
    if (!sh || sh.getLastRow() < 1) return defaultValue;
    var data = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
    var target = String(param).trim().toUpperCase();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === target) {
        var val = data[i][1];
        return (typeof val === 'string') ? val.trim() : val;
      }
    }
  } catch (e) {
    if (typeof Logger !== 'undefined') Logger.log('configGet(' + param + '): ' + e);
  }
  return defaultValue;
}

/**
 * Ecrit une valeur dans _CONFIG (cree ou met a jour la ligne param).
 * @param {string} param
 * @param {*} value
 */
function configSet(param, value) {
  var sh = ensureConfigSheet_();
  var target = String(param).trim().toUpperCase();
  var last = sh.getLastRow();
  var row = -1;
  if (last >= 1) {
    var data = sh.getRange(1, 1, last, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === target) { row = i + 1; break; }
    }
  }
  if (row === -1) row = last + 1;
  sh.getRange(row, 1, 1, 2).setValues([[param, value]]);
}

// =============================================================================
// NIVEAU : fonction unifiee (remplace les 2 doublons legacy)
// =============================================================================

/**
 * Niveau du spreadsheet courant, format canonique "6e".
 * Strategie :
 *   1. _CONFIG.NIVEAU (source de verite multi-tenant)
 *   2. Scan des onglets sources ("6°1", "5°2"...) -> niveau le plus frequent
 *   3. Fallback NIVEAU_DEFAUT
 *
 * @returns {string} "6e" | "5e" | "4e" | "3e"
 */
function getNiveau() {
  // 1. _CONFIG.NIVEAU
  var fromConfig = normalizeNiveau(configGet('NIVEAU', null));
  if (isNiveauValide(fromConfig)) return fromConfig;

  // 2. Scan onglets sources type "6°1"
  try {
    var sheets = SpreadsheetApp.getActive().getSheets();
    var counts = {};
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName();
      if (/^[3-6]\s*°\s*\d+/.test(name) || /^[3-6]e?\d/.test(name)) {
        var niv = normalizeNiveau(name);
        if (isNiveauValide(niv)) counts[niv] = (counts[niv] || 0) + 1;
      }
    }
    var found = Object.keys(counts);
    if (found.length > 0) {
      found.sort(function (a, b) { return counts[b] - counts[a]; });
      return found[0];
    }
  } catch (e) {
    if (typeof Logger !== 'undefined') Logger.log('getNiveau scan: ' + e);
  }

  // 3. Fallback
  return NIVEAU_DEFAUT;
}

/**
 * Fixe le niveau du spreadsheet (init multi-tenant) puis le verrouille.
 * Refuse de changer un niveau deja verrouille (securite prof : evite qu'un
 * import croise reecrive le niveau d'une instance).
 *
 * @param {string} niveau
 * @param {boolean} [force] true pour outrepasser le verrou (admin)
 * @returns {{ok:boolean, niveau:string, message:string}}
 */
function setNiveau(niveau, force) {
  var canon = normalizeNiveau(niveau);
  if (!isNiveauValide(canon)) {
    return { ok: false, niveau: null, message: 'Niveau invalide: ' + niveau };
  }
  var locked = String(configGet('NIVEAU_LOCKED', 'false')).toLowerCase() === 'true';
  var current = normalizeNiveau(configGet('NIVEAU', null));
  if (locked && current && current !== canon && !force) {
    return { ok: false, niveau: current,
      message: 'Niveau verrouille sur ' + current + ' (force requis pour changer).' };
  }
  configSet('NIVEAU', canon);
  configSet('NIVEAU_LOCKED', 'true');
  return { ok: true, niveau: canon, message: 'Niveau fixe sur ' + canon + ' (verrouille).' };
}

// Export Node pour les tests (inerte sous Apps Script).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NIVEAUX_VALIDES: NIVEAUX_VALIDES,
    NIVEAU_DEFAUT: NIVEAU_DEFAUT,
    normalizeNiveau: normalizeNiveau,
    isNiveauValide: isNiveauValide
  };
}
