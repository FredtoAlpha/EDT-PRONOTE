/**
 * ===================================================================
 * Score.gs — SOURCE UNIQUE de l'echelle de score 1-5
 * ===================================================================
 *
 * Regle directrice : AUCUNE valeur de score en dur ailleurs dans le code.
 * Pas de `=== 4`, pas de `['1','2','3','4']` hors de ce fichier. Tout passe
 * par les constantes et helpers definis ici.
 *
 * Echelle (decision actee) : A=5, B=4, C=3, D=2, E=1
 *   5 = Ideal
 *   4 = Satisfaisant
 *   3 = A consolider
 *   2 = A surveiller
 *   1 = Priorite d'accompagnement
 *
 * Transition A/B/C -> A/B/C/D/E : le mapping lettre->score est PARAMETRABLE
 * (override via _CONFIG), jamais code en dur cote appelant. Un fichier qui
 * n'utilise que A/B/C est un sous-ensemble du mapping 5 niveaux.
 *
 * Les fonctions de calcul sont PURES (aucune dependance SpreadsheetApp) afin
 * d'etre testables hors Apps Script. La lecture de config vit dans des
 * wrappers clairement identifies en bas de fichier.
 * ===================================================================
 */

/** Bornes de l'echelle. Toute comparaison de score passe par ces constantes. */
var SCORE = {
  MIN: 1,
  MAX: 5,
  // Seuil "en difficulte" : score <= SEUIL_DIFFICULTE
  SEUIL_DIFFICULTE: 2,
  // Seuil "excellent" : score >= SEUIL_EXCELLENT
  SEUIL_EXCELLENT: 4
};

/** Mapping lettre -> score par defaut (A-E <-> 5-1). Override possible via _CONFIG. */
var SCORE_MAPPING_DEFAULT = { A: 5, B: 4, C: 3, D: 2, E: 1 };

/** Libelles officiels par score. */
var SCORE_LIBELLES = {
  5: 'Ideal',
  4: 'Satisfaisant',
  3: 'A consolider',
  2: 'A surveiller',
  1: "Priorite d'accompagnement"
};

/** Les 4 criteres et leur poids par defaut dans le score composite. */
var CRITERES = ['TRA', 'COM', 'ABS', 'PART'];
var POIDS_CRITERES_DEFAULT = { TRA: 0.40, COM: 0.25, ABS: 0.25, PART: 0.10 };

// =============================================================================
// FONCTIONS PURES (testables en Node)
// =============================================================================

/**
 * Convertit une lettre de critere en score numerique.
 * Tolerant : accepte minuscules/espaces. Rend null si vide ou inconnu
 * (le parser distinguera "colonne absente" / "valeur vide" en amont).
 *
 * @param {string} letter    Lettre A-E (ou A-C en transition)
 * @param {Object} [mapping] Mapping lettre->score (defaut SCORE_MAPPING_DEFAULT)
 * @returns {?number} Score 1-5, ou null
 */
function letterToScore(letter, mapping) {
  mapping = mapping || SCORE_MAPPING_DEFAULT;
  if (letter === null || letter === undefined) return null;
  var key = String(letter).trim().toUpperCase();
  if (key === '') return null;
  return mapping.hasOwnProperty(key) ? mapping[key] : null;
}

/**
 * Convertit un score numerique en lettre, selon le mapping inverse.
 * @param {number} score
 * @param {Object} [mapping]
 * @returns {?string}
 */
function scoreToLetter(score, mapping) {
  mapping = mapping || SCORE_MAPPING_DEFAULT;
  for (var letter in mapping) {
    if (mapping.hasOwnProperty(letter) && mapping[letter] === score) return letter;
  }
  return null;
}

/**
 * Libelle d'un score. Rend '' si score nul/hors echelle.
 * @param {?number} score
 * @returns {string}
 */
function scoreLibelle(score) {
  return SCORE_LIBELLES.hasOwnProperty(score) ? SCORE_LIBELLES[score] : '';
}

/** Score valide (entier dans [MIN, MAX]) ? */
function isScoreValide(score) {
  return typeof score === 'number' && score >= SCORE.MIN && score <= SCORE.MAX;
}

/** Eleve en difficulte sur ce critere ? (score <= SEUIL_DIFFICULTE) */
function isEnDifficulte(score) {
  return isScoreValide(score) && score <= SCORE.SEUIL_DIFFICULTE;
}

/** Eleve excellent sur ce critere ? (score >= SEUIL_EXCELLENT) */
function isExcellent(score) {
  return isScoreValide(score) && score >= SCORE.SEUIL_EXCELLENT;
}

/**
 * Score composite pondere a partir des scores par critere.
 * Ignore les criteres absents (null) en renormalisant les poids sur les
 * criteres reellement presents. Rend null si aucun critere exploitable.
 *
 * @param {Object} scores  { TRA:?number, COM:?number, ABS:?number, PART:?number }
 * @param {Object} [poids] Poids par critere (defaut POIDS_CRITERES_DEFAULT)
 * @returns {?number} Score composite (non arrondi), ou null
 */
function scoreComposite(scores, poids) {
  poids = poids || POIDS_CRITERES_DEFAULT;
  var sommePoids = 0;
  var sommePonderee = 0;
  for (var i = 0; i < CRITERES.length; i++) {
    var crit = CRITERES[i];
    var s = scores ? scores[crit] : null;
    var w = poids[crit] || 0;
    if (isScoreValide(s) && w > 0) {
      sommePoids += w;
      sommePonderee += s * w;
    }
  }
  if (sommePoids === 0) return null;
  return sommePonderee / sommePoids;
}

// =============================================================================
// WRAPPERS CONFIG (Apps Script) — lisent l'override de mapping/poids dans _CONFIG
// =============================================================================

/**
 * Mapping lettre->score effectif : defaut, surchargeable via _CONFIG (cle
 * SCORE_MAPPING au format JSON, ex {"A":5,"B":3,"C":1}). Permet la transition
 * A/B/C -> A/B/C/D/E sans toucher au code.
 * @returns {Object}
 */
function getScoreMapping() {
  var raw = (typeof configGet === 'function') ? configGet('SCORE_MAPPING', null) : null;
  if (raw) {
    try {
      var parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {
      if (typeof Logger !== 'undefined') Logger.log('Score: SCORE_MAPPING invalide, fallback defaut: ' + e);
    }
  }
  return SCORE_MAPPING_DEFAULT;
}

/**
 * Poids des criteres effectifs : defaut, surchargeable via _CONFIG (cle
 * POIDS_CRITERES au format JSON).
 * @returns {Object}
 */
function getPoidsCriteres() {
  var raw = (typeof configGet === 'function') ? configGet('POIDS_CRITERES', null) : null;
  if (raw) {
    try {
      var parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {
      if (typeof Logger !== 'undefined') Logger.log('Score: POIDS_CRITERES invalide, fallback defaut: ' + e);
    }
  }
  return POIDS_CRITERES_DEFAULT;
}

// Export Node pour les tests (inerte sous Apps Script ou `module` est indefini).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCORE: SCORE,
    SCORE_MAPPING_DEFAULT: SCORE_MAPPING_DEFAULT,
    SCORE_LIBELLES: SCORE_LIBELLES,
    CRITERES: CRITERES,
    POIDS_CRITERES_DEFAULT: POIDS_CRITERES_DEFAULT,
    letterToScore: letterToScore,
    scoreToLetter: scoreToLetter,
    scoreLibelle: scoreLibelle,
    isScoreValide: isScoreValide,
    isEnDifficulte: isEnDifficulte,
    isExcellent: isExcellent,
    scoreComposite: scoreComposite
  };
}
