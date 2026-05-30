/**
 * ===================================================================
 * SCORING_CONFIG.JS — Configuration dynamique du scoring
 * ===================================================================
 *
 * Gère la configuration scoring par niveau (6e/5e/4e/3e) :
 * - Mode seuils fixes (comportement actuel) ou percentile
 * - Seuils personnalisables par critère (COM/TRA/PART/ABS)
 * - Distribution percentile configurable
 * - Persistance dans l'onglet caché _SCORING_CONFIG (pattern KV)
 *
 * @version 1.0.0
 * ===================================================================
 */

// =============================================================================
// DEFAULTS — Valeurs par défaut (identiques à l'ancien SCORES_CONFIG)
// =============================================================================

var SCORING_DEFAULTS = {
  mode: 'seuils', // 'seuils' ou 'percentile'

  seuils: {
    ABS: {
      DJ: [
        { score: 5, min: 0, max: 2 },
        { score: 4, min: 3, max: 5 },
        { score: 3, min: 6, max: 13 },
        { score: 2, min: 14, max: 25 },
        { score: 1, min: 26, max: 999 }
      ],
      NJ: [
        { score: 5, min: 0, max: 0 },
        { score: 4, min: 1, max: 1 },
        { score: 3, min: 2, max: 2 },
        { score: 2, min: 3, max: 5 },
        { score: 1, min: 6, max: 999 }
      ],
      poidsDJ: 0.6,
      poidsNJ: 0.4
    },
    COM: [
      { score: 5, min: 0, max: 0 },
      { score: 4, min: 1, max: 2 },
      { score: 3, min: 3, max: 5 },
      { score: 2, min: 6, max: 20 },
      { score: 1, min: 21, max: 999 }
    ],
    TRA: [
      { score: 5, min: 17, max: 20 },
      { score: 4, min: 15, max: 16.999 },
      { score: 3, min: 12, max: 14.999 },
      { score: 2, min: 8, max: 11.999 },
      { score: 1, min: 0, max: 7.999 }
    ],
    PART: [
      { score: 5, min: 17, max: 20 },
      { score: 4, min: 15, max: 16.999 },
      { score: 3, min: 12, max: 14.999 },
      { score: 2, min: 8, max: 11.999 },
      { score: 1, min: 0, max: 7.999 }
    ]
  },

  // Distribution percentile (si mode='percentile')
  percentile: {
    distribution: { 1: 0.10, 2: 0.20, 3: 0.40, 4: 0.20, 5: 0.10 }
  },

  // Poids des critères pour le score composite
  poidsCriteres: { COM: 0.30, TRA: 0.30, PART: 0.20, ABS: 0.20 },

  // Patterns de détection colonnes Pronote (indépendants du niveau)
  patterns: {
    ABS: {
      nom: ['NOM'],
      classe: ['CLASSE'],
      dj: ['DJ', 'DEMI.?JOURN', 'DJ.*BULL'],
      justifiee: ['JUSTIFI']
    },
    INC: {
      nom: ['NOM'],
      classe: ['CLASSE'],
      gravite: ['GRAVIT', 'GRAV']
    },
    PUN: {
      nom: ['NOM'],
      classe: ['CLASSE'],
      nb: ['^NB', 'NOMBRE', 'QT', 'QUANT']
    }
  }
};

// =============================================================================
// KV STORE — Persistance dans _SCORING_CONFIG
// =============================================================================

var SCORING_CONFIG_SHEET_NAME = '_SCORING_CONFIG';

/**
 * S'assure que la feuille _SCORING_CONFIG existe (cachée).
 */
function ensureScoringConfigSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SCORING_CONFIG_SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(SCORING_CONFIG_SHEET_NAME);
    sh.hideSheet();
    var headers = ['KEY', 'VALUE', 'SCOPE', 'UPDATED_AT'];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#6366f1')
      .setFontColor('#FFFFFF');
  }

  return sh;
}

/**
 * Lit une clé depuis _SCORING_CONFIG.
 */
function scoringKvGet_(key, scope, defaultValue) {
  scope = scope || 'GLOBAL';
  defaultValue = defaultValue !== undefined ? defaultValue : null;

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SCORING_CONFIG_SHEET_NAME);

  if (!sh || sh.getLastRow() <= 1) return defaultValue;

  var last = sh.getLastRow();
  var data = sh.getRange(2, 1, last - 1, 3).getValues();

  for (var i = 0; i < data.length; i++) {
    var cellKey = String(data[i][0]).trim();
    var cellScope = String(data[i][2]).trim();
    if (cellKey === key && cellScope === scope) {
      var val = data[i][1];
      // Trim les chaînes pour éviter les espaces parasites de Google Sheets
      if (typeof val === 'string') val = val.trim();
      return val;
    }
  }

  return defaultValue;
}

/**
 * Écrit une clé dans _SCORING_CONFIG.
 */
function scoringKvSet_(key, value, scope) {
  scope = scope || 'GLOBAL';

  var sh = ensureScoringConfigSheet_();
  var last = sh.getLastRow();
  var now = new Date();

  var valueStr = (typeof value === 'object') ? JSON.stringify(value) : String(value);

  var row = -1;
  if (last > 1) {
    var data = sh.getRange(2, 1, last - 1, 3).getValues();
    for (var i = 0; i < data.length; i++) {
      var cellKey = String(data[i][0]).trim();
      var cellScope = String(data[i][2]).trim();
      if (cellKey === key && cellScope === scope) {
        row = i + 2;
        break;
      }
    }
  }

  if (row === -1) row = last + 1;

  sh.getRange(row, 1, 1, 4).setValues([[key, valueStr, scope, now]]);
}

// =============================================================================
// API PUBLIQUE
// =============================================================================

function hasScoringLevel_(seuils, score) {
  if (!Array.isArray(seuils)) return false;
  return seuils.some(function(s) { return Number(s.score) === score; });
}

function ensureFiveLevelScoringConfig_(config) {
  var defaults = SCORING_DEFAULTS;
  ['COM', 'TRA', 'PART'].forEach(function(crit) {
    if (!hasScoringLevel_(config.seuils[crit], 5)) {
      config.seuils[crit] = JSON.parse(JSON.stringify(defaults.seuils[crit]));
    }
  });

  if (!config.seuils.ABS) config.seuils.ABS = JSON.parse(JSON.stringify(defaults.seuils.ABS));
  if (!hasScoringLevel_(config.seuils.ABS.DJ, 5)) {
    config.seuils.ABS.DJ = JSON.parse(JSON.stringify(defaults.seuils.ABS.DJ));
  }
  if (!hasScoringLevel_(config.seuils.ABS.NJ, 5)) {
    config.seuils.ABS.NJ = JSON.parse(JSON.stringify(defaults.seuils.ABS.NJ));
  }
  if (config.seuils.ABS.poidsDJ === undefined) config.seuils.ABS.poidsDJ = defaults.seuils.ABS.poidsDJ;
  if (config.seuils.ABS.poidsNJ === undefined) config.seuils.ABS.poidsNJ = defaults.seuils.ABS.poidsNJ;

  if (!config.percentile) config.percentile = {};
  var dist = config.percentile.distribution || {};
  if (dist[5] === undefined) {
    config.percentile.distribution = JSON.parse(JSON.stringify(defaults.percentile.distribution));
  } else {
    [1, 2, 3, 4, 5].forEach(function(score) {
      if (config.percentile.distribution[score] === undefined) {
        config.percentile.distribution[score] = defaults.percentile.distribution[score];
      }
    });
  }

  var p = config.poidsCriteres || {};
  var oldDefaults =
    Number(p.COM) === 0.25 &&
    Number(p.TRA) === 0.40 &&
    Number(p.PART) === 0.10 &&
    Number(p.ABS) === 0.25;
  if (oldDefaults) {
    config.poidsCriteres = JSON.parse(JSON.stringify(defaults.poidsCriteres));
  } else {
    config.poidsCriteres = {
      COM: p.COM !== undefined ? Number(p.COM) : defaults.poidsCriteres.COM,
      TRA: p.TRA !== undefined ? Number(p.TRA) : defaults.poidsCriteres.TRA,
      PART: p.PART !== undefined ? Number(p.PART) : defaults.poidsCriteres.PART,
      ABS: p.ABS !== undefined ? Number(p.ABS) : defaults.poidsCriteres.ABS
    };
  }

  return ensureFiveLevelScoringConfig_(config);
}

/**
 * Retourne la configuration scoring pour un niveau donné.
 * Merge: SCORING_DEFAULTS + overrides depuis _SCORING_CONFIG.
 *
 * @param {string} [niveau] - '6e', '5e', '4e', '3e' (optionnel)
 * @returns {Object} Config scoring complète
 */
function getScoringConfig(niveau) {
  // Commencer avec les defaults
  var config = JSON.parse(JSON.stringify(SCORING_DEFAULTS));

  // Lire le mode depuis KV (valider que c'est une valeur connue)
  var modeKv = scoringKvGet_('scoring.mode', 'GLOBAL', null);
  if (modeKv) {
    var modeStr = String(modeKv).trim().toLowerCase();
    if (modeStr === 'seuils' || modeStr === 'percentile') {
      config.mode = modeStr;
    } else {
      Logger.log('Scoring_Config: mode KV invalide "' + modeKv + '", fallback sur defaults');
    }
  }

  // Lire les seuils custom depuis KV
  var seuilsJson = scoringKvGet_('scoring.seuils', 'GLOBAL', null);
  if (seuilsJson) {
    try {
      var customSeuils = JSON.parse(seuilsJson);
      // Merge par critère (ne remplace que ce qui est fourni)
      for (var crit in customSeuils) {
        if (customSeuils.hasOwnProperty(crit)) {
          config.seuils[crit] = customSeuils[crit];
        }
      }
    } catch (e) {
      Logger.log('Scoring_Config: erreur parsing seuils custom: ' + e.message);
    }
  }

  // Lire la distribution percentile depuis KV
  var distJson = scoringKvGet_('scoring.percentile.distribution', 'GLOBAL', null);
  if (distJson) {
    try {
      config.percentile.distribution = JSON.parse(distJson);
    } catch (e) {
      Logger.log('Scoring_Config: erreur parsing distribution: ' + e.message);
    }
  }

  // Override par niveau si disponible
  if (niveau) {
    var niveauSeuilsJson = scoringKvGet_('scoring.seuils', niveau, null);
    if (niveauSeuilsJson) {
      try {
        var niveauSeuils = JSON.parse(niveauSeuilsJson);
        for (var crit in niveauSeuils) {
          if (niveauSeuils.hasOwnProperty(crit)) {
            config.seuils[crit] = niveauSeuils[crit];
          }
        }
      } catch (e) {
        Logger.log('Scoring_Config: erreur parsing seuils niveau ' + niveau + ': ' + e.message);
      }
    }
  }

  // Lire les poids critères
  var poidsJson = scoringKvGet_('scoring.poidsCriteres', 'GLOBAL', null);
  if (poidsJson) {
    try {
      config.poidsCriteres = JSON.parse(poidsJson);
    } catch (e) {
      Logger.log('Scoring_Config: erreur parsing poids: ' + e.message);
    }
  }

  return config;
}

/**
 * Sauvegarde la configuration scoring.
 *
 * @param {Object} config - { mode, seuils, percentile, poidsCriteres }
 * @param {string} [niveau] - Scope niveau (optionnel, 'GLOBAL' par défaut)
 */
function saveScoringConfig(config, niveau) {
  var scope = niveau || 'GLOBAL';
  if (config.seuils || config.percentile || config.poidsCriteres) {
    var normalizedConfig = ensureFiveLevelScoringConfig_({
      seuils: config.seuils || JSON.parse(JSON.stringify(SCORING_DEFAULTS.seuils)),
      percentile: config.percentile || JSON.parse(JSON.stringify(SCORING_DEFAULTS.percentile)),
      poidsCriteres: config.poidsCriteres || JSON.parse(JSON.stringify(SCORING_DEFAULTS.poidsCriteres))
    });
    if (config.seuils) config.seuils = normalizedConfig.seuils;
    if (config.percentile) config.percentile = normalizedConfig.percentile;
    if (config.poidsCriteres) config.poidsCriteres = normalizedConfig.poidsCriteres;
  }

  if (config.mode) {
    scoringKvSet_('scoring.mode', config.mode, 'GLOBAL');
  }

  if (config.seuils) {
    scoringKvSet_('scoring.seuils', config.seuils, scope);
  }

  if (config.percentile && config.percentile.distribution) {
    var d = config.percentile.distribution;
    var sum = (d[1] || 0) + (d[2] || 0) + (d[3] || 0) + (d[4] || 0) + (d[5] || 0);
    if (sum > 0 && Math.abs(sum - 1.0) > 0.05) {
      Logger.log('⚠️ saveScoringConfig: normalisation distribution percentile (somme=' + sum.toFixed(3) + ')');
      d = {
        1: (d[1] || 0) / sum,
        2: (d[2] || 0) / sum,
        3: (d[3] || 0) / sum,
        4: (d[4] || 0) / sum,
        5: (d[5] || 0) / sum
      };
    }
    scoringKvSet_('scoring.percentile.distribution', d, 'GLOBAL');
  }

  if (config.poidsCriteres) {
    scoringKvSet_('scoring.poidsCriteres', config.poidsCriteres, 'GLOBAL');
  }

  SpreadsheetApp.flush();
}

/**
 * Retourne le mode scoring actif.
 * @returns {string} 'seuils' ou 'percentile'
 */
function getScoringMode() {
  return scoringKvGet_('scoring.mode', 'GLOBAL', 'seuils');
}

/**
 * Retourne la distribution percentile configurée.
 * @returns {Object} { 1: 0.10, 2: 0.20, 3: 0.40, 4: 0.20, 5: 0.10 }
 */
function getPercentileDistribution() {
  var distJson = scoringKvGet_('scoring.percentile.distribution', 'GLOBAL', null);
  if (distJson) {
    try {
      return JSON.parse(distJson);
    } catch (e) { /* fallback */ }
  }
  return SCORING_DEFAULTS.percentile.distribution;
}

/**
 * Retourne les patterns de détection de colonnes Pronote.
 * @returns {Object} { ABS: {...}, INC: {...}, PUN: {...} }
 */
function getScoringPatterns() {
  return SCORING_DEFAULTS.patterns;
}
