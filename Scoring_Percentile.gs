/**
 * ===================================================================
 * SCORING_PERCENTILE.JS - Moteur de scoring par percentile
 * ===================================================================
 *
 * Calcule les scores 1-5 en se basant sur le rang de chaque eleve dans
 * la cohorte, plutot que sur des seuils fixes.
 *
 * Distribution configurable par defaut :
 * { 1: 0.10, 2: 0.20, 3: 0.40, 4: 0.20, 5: 0.10 }
 *
 * @version 1.1.0
 * ===================================================================
 */

function getPercentileScoreValues_() {
  if (typeof HARMONY_SCORE_VALUES !== 'undefined' && HARMONY_SCORE_VALUES && HARMONY_SCORE_VALUES.length) {
    return HARMONY_SCORE_VALUES;
  }
  return [1, 2, 3, 4, 5];
}

function getDefaultPercentileDistribution_() {
  return { 1: 0.10, 2: 0.20, 3: 0.40, 4: 0.20, 5: 0.10 };
}

function normalizePercentileDistribution_(distribution) {
  var scoreValues = getPercentileScoreValues_();
  var fallback = getDefaultPercentileDistribution_();
  var normalized = {};
  var distSum = 0;
  distribution = distribution || fallback;

  scoreValues.forEach(function(score) {
    var raw = distribution[score] !== undefined ? Number(distribution[score]) : (fallback[score] || 0);
    normalized[score] = isNaN(raw) ? 0 : raw;
    distSum += normalized[score];
  });

  if (distSum <= 0) return fallback;

  if (Math.abs(distSum - 1.0) > 0.05) {
    if (typeof Logger !== 'undefined') {
      Logger.log('Distribution percentile invalide (somme=' + distSum.toFixed(3) + '), normalisation...');
    }
    scoreValues.forEach(function(score) {
      normalized[score] = normalized[score] / distSum;
    });
  }

  return normalized;
}

/**
 * Calcule les scores 1-5 par percentile pour un tableau de valeurs.
 *
 * @param {Array} entries - Tableau de { index: number, valeur: number|null }
 * @param {Object} distribution - Fractions par score, ex { 1:.10, ..., 5:.10 }
 * @returns {Array} Tableau de { index, valeur, score }
 */
function computePercentileScores(entries, distribution) {
  if (!entries || entries.length === 0) return [];

  var scoreValues = getPercentileScoreValues_();
  distribution = normalizePercentileDistribution_(distribution);

  var withValue = [];
  var withoutValue = [];

  for (var i = 0; i < entries.length; i++) {
    if (entries[i].valeur !== null && entries[i].valeur !== undefined && !isNaN(entries[i].valeur)) {
      withValue.push({ index: entries[i].index, valeur: entries[i].valeur });
    } else {
      withoutValue.push({ index: entries[i].index, valeur: null, score: null });
    }
  }

  if (withValue.length === 0) {
    return withoutValue;
  }

  withValue.sort(function(a, b) { return a.valeur - b.valeur; });

  var N = withValue.length;
  var cuts = [];
  var cumulative = 0;

  for (var c = 0; c < scoreValues.length - 1; c++) {
    cumulative += distribution[scoreValues[c]] || 0;
    cuts.push(Math.floor(N * cumulative));
  }

  for (var j = 0; j < withValue.length; j++) {
    var assigned = scoreValues[scoreValues.length - 1];
    for (var k = 0; k < cuts.length; k++) {
      if (j < cuts[k]) {
        assigned = scoreValues[k];
        break;
      }
    }
    withValue[j].score = assigned;
  }

  return withValue.concat(withoutValue);
}

/**
 * Calcule les seuils de coupure percentile pour une serie de valeurs.
 *
 * @param {number[]} valeurs - Notes brutes valides ou nulles
 * @param {Object} distribution - Fractions par score
 * @returns {Object} { cutoffs, counts, total }
 */
function computePercentileSeuils(valeurs, distribution) {
  var scoreValues = getPercentileScoreValues_();
  var emptyCutoffs = [];
  var emptyCounts = [];
  for (var z = 0; z < scoreValues.length - 1; z++) emptyCutoffs.push(0);
  for (var y = 0; y < scoreValues.length; y++) emptyCounts.push(0);

  if (!valeurs || valeurs.length === 0) {
    return { cutoffs: emptyCutoffs, counts: emptyCounts, total: 0 };
  }

  distribution = normalizePercentileDistribution_(distribution);

  var sorted = valeurs.filter(function(v) {
    return v !== null && v !== undefined && !isNaN(v);
  }).sort(function(a, b) { return a - b; });

  var N = sorted.length;
  if (N === 0) {
    return { cutoffs: emptyCutoffs, counts: emptyCounts, total: 0 };
  }

  var cutoffs = [];
  var counts = [];
  var cumulative = 0;
  var previousCut = 0;

  for (var i = 0; i < scoreValues.length - 1; i++) {
    cumulative += distribution[scoreValues[i]] || 0;
    var cut = Math.floor(N * cumulative);
    var idx = Math.max(0, Math.min(N - 1, cut - 1));
    cutoffs.push(Math.round(sorted[idx] * 100) / 100);
    counts.push(cut - previousCut);
    previousCut = cut;
  }
  counts.push(N - previousCut);

  return {
    cutoffs: cutoffs,
    counts: counts,
    total: N
  };
}

/**
 * Applique le scoring percentile sur un critere complet.
 *
 * @param {Array} resultats - Tableau de resultats bruts
 * @param {string} scoreField - Nom du champ score a remplir (ex: 'scoreTRA')
 * @param {Object} [distribution] - Distribution personnalisee
 * @returns {Array} Memes resultats avec le champ score rempli
 */
function applyPercentileToResults(resultats, scoreField, distribution) {
  if (!resultats || resultats.length === 0) return resultats;

  var entries = [];
  for (var i = 0; i < resultats.length; i++) {
    entries.push({
      index: i,
      valeur: resultats[i].valeurBrute !== undefined ? resultats[i].valeurBrute : null
    });
  }

  var scored = computePercentileScores(entries, distribution);

  for (var j = 0; j < scored.length; j++) {
    var idx = scored[j].index;
    resultats[idx][scoreField] = scored[j].score;
  }

  return resultats;
}
