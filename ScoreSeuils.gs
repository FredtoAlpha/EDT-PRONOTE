/**
 * ===================================================================
 * ScoreSeuils.gs — Seuils de scoring (mode Pronote-moyennes, OPTIONNEL)
 * ===================================================================
 *
 * En mode EDT (defaut), les scores arrivent deja en A-E : ce fichier n'est PAS
 * sollicite. Il sert au mode optionnel "Pronote-moyennes" ou un score 1-5 est
 * derive d'une valeur mesuree (moyenne /20, nb d'absences, nb d'incidents).
 *
 * Porte SCORING_DEFAULTS du legacy, ETENDU de 1-4 a l'echelle 1-5 (Score.gs).
 * Deux modes conserves : 'seuils' (bornes fixes) et 'percentile' (distribution).
 *
 * Config persistee dans le MEME onglet _CONFIG (cles JSON), pas de 2e onglet
 * de config : un seul endroit pour tout.
 * ===================================================================
 */

/**
 * Bornes par defaut. Chaque bucket : { score, min, max } (bornes incluses).
 * Les scores referencent l'echelle de Score.gs (1..5), jamais de magie locale.
 */
var SCORE_SEUILS_DEFAULT = {
  mode: 'seuils', // 'seuils' | 'percentile'

  seuils: {
    // TRA / PART : moyenne sur 20 -> 5..1
    TRA: [
      { score: 5, min: 16,  max: 20 },
      { score: 4, min: 14,  max: 15.999 },
      { score: 3, min: 11,  max: 13.999 },
      { score: 2, min: 8,   max: 10.999 },
      { score: 1, min: 0,   max: 7.999 }
    ],
    PART: [
      { score: 5, min: 16,  max: 20 },
      { score: 4, min: 14,  max: 15.999 },
      { score: 3, min: 11,  max: 13.999 },
      { score: 2, min: 8,   max: 10.999 },
      { score: 1, min: 0,   max: 7.999 }
    ],
    // COM : nombre d'incidents -> 5..1 (moins il y en a, mieux c'est)
    COM: [
      { score: 5, min: 0,   max: 0 },
      { score: 4, min: 1,   max: 2 },
      { score: 3, min: 3,   max: 7 },
      { score: 2, min: 8,   max: 20 },
      { score: 1, min: 21,  max: 9999 }
    ],
    // ABS : demi-journees d'absence, ponderees justifiees (DJ) / non justifiees (NJ)
    ABS: {
      DJ: [
        { score: 5, min: 0,  max: 3 },
        { score: 4, min: 4,  max: 8 },
        { score: 3, min: 9,  max: 15 },
        { score: 2, min: 16, max: 25 },
        { score: 1, min: 26, max: 9999 }
      ],
      NJ: [
        { score: 5, min: 0,  max: 0 },
        { score: 4, min: 1,  max: 1 },
        { score: 3, min: 2,  max: 3 },
        { score: 2, min: 4,  max: 6 },
        { score: 1, min: 7,  max: 9999 }
      ],
      poidsDJ: 0.6,
      poidsNJ: 0.4
    }
  },

  // Distribution percentile sur 5 niveaux (somme = 1).
  percentile: {
    distribution: { 5: 0.10, 4: 0.20, 3: 0.40, 2: 0.20, 1: 0.10 }
  }
};

// =============================================================================
// PUR : conversion valeur -> score (testable)
// =============================================================================

/**
 * Convertit une valeur mesuree en score selon une table de buckets.
 * @param {number} value
 * @param {Array<{score:number,min:number,max:number}>} buckets
 * @returns {?number} score, ou null si valeur non numerique / hors buckets
 */
function valueToScore(value, buckets) {
  if (typeof value !== 'number' || isNaN(value) || !buckets) return null;
  for (var i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    if (value >= b.min && value <= b.max) return b.score;
  }
  return null;
}

// =============================================================================
// CONFIG (Apps Script) — persistee dans _CONFIG (cles JSON)
// =============================================================================

/**
 * Config de seuils effective : defaut surchargee par _CONFIG (cle SCORE_SEUILS).
 * @returns {Object} copie de SCORE_SEUILS_DEFAULT, eventuellement surchargee
 */
function getSeuilsConfig() {
  var config = JSON.parse(JSON.stringify(SCORE_SEUILS_DEFAULT));
  if (typeof configGet !== 'function') return config;

  var modeRaw = configGet('SCORE_MODE', null);
  if (modeRaw === 'seuils' || modeRaw === 'percentile') config.mode = modeRaw;

  var seuilsRaw = configGet('SCORE_SEUILS', null);
  if (seuilsRaw) {
    try {
      var custom = (typeof seuilsRaw === 'string') ? JSON.parse(seuilsRaw) : seuilsRaw;
      for (var crit in custom) {
        if (custom.hasOwnProperty(crit)) config.seuils[crit] = custom[crit];
      }
    } catch (e) {
      if (typeof Logger !== 'undefined') Logger.log('getSeuilsConfig: SCORE_SEUILS invalide: ' + e);
    }
  }

  var distRaw = configGet('SCORE_PERCENTILE', null);
  if (distRaw) {
    try {
      config.percentile.distribution = (typeof distRaw === 'string') ? JSON.parse(distRaw) : distRaw;
    } catch (e) {
      if (typeof Logger !== 'undefined') Logger.log('getSeuilsConfig: SCORE_PERCENTILE invalide: ' + e);
    }
  }
  return config;
}

// Export Node pour les tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCORE_SEUILS_DEFAULT: SCORE_SEUILS_DEFAULT,
    valueToScore: valueToScore
  };
}
