/**
 * ===================================================================
 * ImportEDT.gs — Parser UNIQUE du fichier EDT prerentree
 * ===================================================================
 *
 * Lit un export EDT (double en-tete, ~580 lignes) et produit le modele interne
 * normalise + un rapport de preflight. AUCUN autre chemin d'import.
 *
 * Points durs geres (constates sur fichiers reels) :
 *  - CSV quote-aware : les options contiennent des virgules entre guillemets
 *    -> jamais de split(',') sur une ligne brute.
 *  - Double en-tete : ligne 1 + sous-colonnes Criteres en ligne 2.
 *  - 3 etats par critere : colonne ABSENTE / valeur VIDE / valeur PRESENTE.
 *  - Filtrage par niveau : un export peut melanger les niveaux ; on ne garde
 *    que ceux dont le MEF previsionnel correspond au niveau cible.
 *  - Statuts d'options (O)/(F)/(X) = Obligatoire / Facultatif / eXclu.
 *  - MEF speciaux : UPE2A / ULIS / BILANGUE / SEGPA -> profil pedagogique.
 *  - Contraintes (Regroupe avec / Separe de / Verrou) tolerantes (souvent vides).
 *
 * Le score (A-E -> 1-5) passe exclusivement par Score.gs (letterToScore).
 * ===================================================================
 */

// =============================================================================
// CSV quote-aware (pur)
// =============================================================================

/**
 * Parse un texte CSV en tableau 2D, en respectant les guillemets (virgules et
 * sauts de ligne proteges) et les guillemets echappes "".
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsvText(text) {
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  var s = String(text);
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore (gere par \n)
    } else {
      field += c;
    }
  }
  // dernier champ / derniere ligne
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// =============================================================================
// Normalisation d'en-tete + detection des colonnes (pur)
// =============================================================================

/** Normalise un libelle : sans accents, majuscules, alphanumerique + espaces. */
function normalizeHeader_(s) {
  if (s === null || s === undefined) return '';
  var t = String(s);
  if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Classe une colonne (d'apres son libelle fusionne) vers une cle semantique. */
function classifyHeader_(label) {
  var h = normalizeHeader_(label);
  if (h === '') return null;
  // Du plus specifique au plus generique.
  if (h.indexOf('NIVEAU SCOLAIRE') >= 0) return 'TRA';
  if (h.indexOf('COMPORTEMENT') >= 0) return 'COM';
  if (h.indexOf('ABSENT') >= 0) return 'ABS';
  if (h.indexOf('A DEFINIR') >= 0 || h === 'DEFINIR') return 'PART';
  if (h.indexOf('REGROUPE') >= 0) return 'ASSO';
  if (h.indexOf('SEPARE') >= 0) return 'DISSO';
  if (h.indexOf('VERROU') >= 0) return 'VERROU';
  if (h.indexOf('REDOUBLANT') >= 0) return 'REDOUBLANT';
  if (h.indexOf('OPTIONS PREVISIONN') >= 0) return 'OPTIONS_PREV';
  if (h.indexOf('OPTIONS PRECEDENT') >= 0) return 'OPTIONS_PREC';
  if (h.indexOf('MEF PREVISIONN') >= 0) return 'MEF_PREV';
  if (h.indexOf('ANCIEN MEF') >= 0) return 'ANCIEN_MEF';
  if (h.indexOf('CLASSE PREVISIONN') >= 0) return 'CLASSE_PREV';
  if (h.indexOf('ANCIENNE CLASSE') >= 0) return 'ANCIENNE_CLASSE';
  if (h.indexOf('SEXE') >= 0) return 'SEXE';
  if (h.indexOf('PRENOM') >= 0) return 'PRENOM';
  // "Ne(e) le" -> selon decomposition : "NEE LE" ou "NE E LE" -> on compare sans espaces
  if (h.replace(/ /g, '').indexOf('NEELE') >= 0) return 'NE_LE';
  if (h.indexOf('NOM') >= 0) return 'NOM'; // apres PRENOM
  return null;
}

/**
 * Detecte les colonnes a partir des 2 lignes d'en-tete.
 * Fusionne ligne1 + ligne2 (ligne2 prioritaire pour les sous-colonnes Criteres).
 * @param {string[]} h1
 * @param {string[]} h2
 * @returns {{map:Object, absents:string[]}}
 */
function detectColumns(h1, h2) {
  h1 = h1 || []; h2 = h2 || [];
  var n = Math.max(h1.length, h2.length);
  var map = {};
  for (var i = 0; i < n; i++) {
    var label = (h2[i] && String(h2[i]).trim() !== '') ? h2[i] : h1[i];
    var key = classifyHeader_(label);
    if (key && !(key in map)) map[key] = i;
  }
  var attendus = ['NOM', 'PRENOM', 'SEXE', 'MEF_PREV', 'ANCIEN_MEF', 'TRA', 'COM', 'ABS', 'PART'];
  var absents = attendus.filter(function (k) { return !(k in map); });
  return { map: map, absents: absents };
}

// =============================================================================
// Options Pronote / EDT (pur) — reecrit propre, capture le statut (O)/(F)/(X)
// =============================================================================

var LANGUES_LV2 = {
  'ESPAGNOL': 'ESP', 'ALLEMAND': 'ALL', 'ITALIEN': 'ITA', 'CHINOIS': 'CHI',
  'PORTUGAIS': 'POR', 'ARABE': 'ARA', 'RUSSE': 'RUS', 'JAPONAIS': 'JAP'
};
var OPTIONS_CONNUES = ['LATIN', 'GREC', 'CHAV', 'CHINOIS', 'LCALA', 'LLCA', 'EURO'];
var OPTIONS_ALIASES = { 'CHANT': 'CHAV', 'CHORAL': 'CHAV', 'LCA': 'LATIN' };

/**
 * Parse une chaine d'options "ANGLAIS LV1 (O), ESPAGNOL LV2 (O), LCA LATIN (F)".
 * @param {string} raw
 * @returns {{lv1:string, lv2:string, opt:string, options:Array<{libelle:string,statut:string}>}}
 */
function parseOptions(raw) {
  var result = { lv1: '', lv2: '', opt: '', options: [] };
  if (!raw) return result;
  var parts = String(raw).split(',');
  for (var i = 0; i < parts.length; i++) {
    var brut = parts[i].trim();
    if (brut === '') continue;
    var statut = '';
    var m = brut.match(/\(([OFX])\)\s*$/i);
    if (m) statut = m[1].toUpperCase();
    var libelle = brut.replace(/\(([OFX])\)\s*$/i, '').trim();
    var up = libelle.toUpperCase();
    result.options.push({ libelle: libelle, statut: statut });

    if (up.indexOf('LV2') >= 0) {
      for (var langue in LANGUES_LV2) {
        if (up.indexOf(langue) >= 0) { result.lv2 = LANGUES_LV2[langue]; break; }
      }
      continue;
    }
    if (up.indexOf('LV1') >= 0) {
      var motL1 = up.replace(/\s*LV1.*/, '').trim();
      if (!result.lv1) result.lv1 = motL1;
      continue;
    }
    if (!result.opt) {
      for (var j = 0; j < OPTIONS_CONNUES.length; j++) {
        if (up.indexOf(OPTIONS_CONNUES[j]) >= 0) { result.opt = OPTIONS_CONNUES[j]; break; }
      }
      if (!result.opt) {
        for (var alias in OPTIONS_ALIASES) {
          if (up.indexOf(alias) >= 0) { result.opt = OPTIONS_ALIASES[alias]; break; }
        }
      }
    }
  }
  return result;
}

// =============================================================================
// MEF (pur) — niveau de base + profil pedagogique special
// =============================================================================

var PROFILS_SPECIAUX = ['UPE2A', 'ULIS', 'SEGPA', 'BILANGUE'];

/**
 * Extrait le niveau de base + un profil special d'une chaine MEF.
 * "4EME UPE2A" -> { niveau:'4e', profil:'UPE2A' } ; "3EME" -> { niveau:'3e', profil:null }
 * @param {string} mef
 * @returns {{niveau:?string, profil:?string, brut:string}}
 */
function parseMef(mef) {
  var brut = (mef === null || mef === undefined) ? '' : String(mef).trim();
  var up = brut.toUpperCase();
  var profil = null;
  for (var i = 0; i < PROFILS_SPECIAUX.length; i++) {
    if (up.indexOf(PROFILS_SPECIAUX[i]) >= 0) { profil = PROFILS_SPECIAUX[i]; break; }
  }
  var niveau = (typeof normalizeNiveau === 'function') ? normalizeNiveau(brut) : null;
  return { niveau: niveau, profil: profil, brut: brut };
}

// =============================================================================
// Etat d'un critere : ABSENT / VIDE / PRESENT (pur)
// =============================================================================

/**
 * @param {Object} map  table colonnes
 * @param {string} key  cle critere (TRA/COM/ABS/PART)
 * @param {string[]} row
 * @param {Object} mapping mapping lettre->score
 * @returns {{etat:'ABSENT'|'VIDE'|'PRESENT', lettre:string, score:?number}}
 */
function lireCritere_(map, key, row, mapping) {
  if (!(key in map)) return { etat: 'ABSENT', lettre: '', score: null };
  var raw = row[map[key]];
  var lettre = (raw === null || raw === undefined) ? '' : String(raw).trim();
  if (lettre === '') return { etat: 'VIDE', lettre: '', score: null };
  return { etat: 'PRESENT', lettre: lettre.toUpperCase(), score: letterToScore(lettre, mapping) };
}

function cell_(map, key, row) {
  if (!(key in map)) return '';
  var v = row[map[key]];
  return (v === null || v === undefined) ? '' : String(v).trim();
}

// =============================================================================
// Parser principal (pur)
// =============================================================================

/**
 * @param {string[][]} rows   lignes CSV (incluant les 2 en-tetes)
 * @param {Object} [options]  { niveau:'3e', mapping:{...} }
 * @returns {{eleves:Array, preflight:Object}}
 */
function parseEdt(rows, options) {
  options = options || {};
  var mapping = options.mapping || (typeof SCORE_MAPPING_DEFAULT !== 'undefined' ? SCORE_MAPPING_DEFAULT : { A: 5, B: 4, C: 3, D: 2, E: 1 });
  if (!rows || rows.length < 3) {
    return { eleves: [], preflight: { ok: false, total: 0, warnings: ['Fichier trop court (en-tetes + 0 ligne).'] } };
  }

  var det = detectColumns(rows[0], rows[1]);
  var map = det.map;
  var dataRows = rows.slice(2);

  // Niveau cible : option explicite, sinon MEF previsionnel majoritaire.
  var niveauCible = options.niveau ? normalizeNiveau(options.niveau) : null;
  if (!niveauCible) niveauCible = inferNiveauMajoritaire_(dataRows, map);

  var eleves = [];
  var preflight = {
    ok: true,
    niveauCible: niveauCible,
    colonnesAbsentes: det.absents,
    total: 0, gardes: 0, filtres: 0, ignores: 0,
    parNiveau: {},
    criteres: { TRA: vide_(), COM: vide_(), ABS: vide_(), PART: vide_() },
    options: { remplies: 0, vides: 0 },
    profilsSpeciaux: [],
    contraintes: { regroupe: 0, separe: 0, verrou: 0 },
    homonymes: [],
    warnings: []
  };
  if (det.absents.length) {
    preflight.warnings.push('Colonnes attendues absentes: ' + det.absents.join(', '));
  }

  var vusParNom = {}; // "NOM|PRENOM" -> [ligne(s) fichier]
  for (var r = 0; r < dataRows.length; r++) {
    var row = dataRows[r];
    var ligneFichier = r + 3; // 1-based, apres les 2 en-tetes
    var nom = cell_(map, 'NOM', row);
    var prenom = cell_(map, 'PRENOM', row);
    if (nom === '' && prenom === '') { preflight.ignores++; continue; } // ligne vide
    preflight.total++;

    var mefPrev = parseMef(cell_(map, 'MEF_PREV', row));
    var mefAncien = parseMef(cell_(map, 'ANCIEN_MEF', row));
    var nivEleve = mefPrev.niveau || mefAncien.niveau;
    if (nivEleve) preflight.parNiveau[nivEleve] = (preflight.parNiveau[nivEleve] || 0) + 1;

    // Filtrage par niveau cible
    if (niveauCible && nivEleve && nivEleve !== niveauCible) { preflight.filtres++; continue; }

    // Criteres (3 etats)
    var crit = {};
    ['TRA', 'COM', 'ABS', 'PART'].forEach(function (k) {
      var c = lireCritere_(map, k, row, mapping);
      crit[k] = c;
      preflight.criteres[k][c.etat.toLowerCase()]++;
    });

    // Options (previsionnelles en priorite, sinon precedentes)
    var optRaw = cell_(map, 'OPTIONS_PREV', row) || cell_(map, 'OPTIONS_PREC', row);
    var opts = parseOptions(optRaw);
    if (optRaw === '') preflight.options.vides++; else preflight.options.remplies++;

    // Profil special
    var profil = mefPrev.profil || mefAncien.profil || null;
    if (profil) preflight.profilsSpeciaux.push({ nom: nom, prenom: prenom, profil: profil, ligne: ligneFichier });

    // Contraintes (tolerantes)
    var regroupe = cell_(map, 'ASSO', row);
    var separe = cell_(map, 'DISSO', row);
    var verrouRaw = cell_(map, 'VERROU', row);
    var verrou = verrouRaw !== '' && verrouRaw.toUpperCase() !== 'NON' && verrouRaw !== '0';
    if (regroupe) preflight.contraintes.regroupe++;
    if (separe) preflight.contraintes.separe++;
    if (verrou) preflight.contraintes.verrou++;

    var eleve = {
      ligneFichier: ligneFichier,
      nom: nom, prenom: prenom,
      sexe: normSexe_(cell_(map, 'SEXE', row)),
      neLe: cell_(map, 'NE_LE', row),
      ancienneClasse: cell_(map, 'ANCIENNE_CLASSE', row),
      niveau: niveauCible || nivEleve,
      profil: profil,
      lv1: opts.lv1, lv2: opts.lv2, opt: opts.opt, options: opts.options,
      scores: { TRA: crit.TRA.score, COM: crit.COM.score, ABS: crit.ABS.score, PART: crit.PART.score },
      etatsCriteres: { TRA: crit.TRA.etat, COM: crit.COM.etat, ABS: crit.ABS.etat, PART: crit.PART.etat },
      composite: (typeof scoreComposite === 'function')
        ? scoreComposite({ TRA: crit.TRA.score, COM: crit.COM.score, ABS: crit.ABS.score, PART: crit.PART.score })
        : null,
      regroupeAvec: regroupe, separeDe: separe, verrou: verrou
    };
    eleves.push(eleve);
    preflight.gardes++;

    var cle = (nom + '|' + prenom).toUpperCase();
    (vusParNom[cle] = vusParNom[cle] || []).push(ligneFichier);
  }

  // Homonymes (meme NOM + PRENOM)
  for (var cle2 in vusParNom) {
    if (vusParNom[cle2].length > 1) {
      var parts = cle2.split('|');
      preflight.homonymes.push({ nom: parts[0], prenom: parts[1], lignes: vusParNom[cle2] });
    }
  }

  return { eleves: eleves, preflight: preflight };
}

/**
 * Resume lisible d'un preflight (pour log / UI). Pur.
 * @param {Object} pf  preflight de parseEdt
 * @returns {string}
 */
function resumePreflight(pf) {
  if (!pf) return '(aucun preflight)';
  var L = [];
  L.push('Niveau cible : ' + pf.niveauCible);
  L.push('Eleves : ' + pf.total + ' lus, ' + pf.gardes + ' gardes, ' + pf.filtres + ' filtres (autre niveau).');
  var crit = pf.criteres;
  ['TRA', 'COM', 'ABS', 'PART'].forEach(function (k) {
    L.push('  ' + k + ' : ' + crit[k].present + ' renseignes / ' + crit[k].vide + ' vides / ' + crit[k].absent + ' absents.');
  });
  L.push('Options : ' + pf.options.remplies + ' remplies, ' + pf.options.vides + ' vides.');
  L.push('Profils speciaux : ' + pf.profilsSpeciaux.length + '.');
  L.push('Contraintes : ' + pf.contraintes.regroupe + ' regroupe, ' + pf.contraintes.separe + ' separe, ' + pf.contraintes.verrou + ' verrou.');
  if (pf.homonymes.length) {
    L.push('Homonymes (' + pf.homonymes.length + ') :');
    pf.homonymes.forEach(function (h) { L.push('  ' + h.nom + ' ' + h.prenom + ' -> lignes ' + h.lignes.join(', ')); });
  }
  if (pf.warnings.length) L.push('Avertissements : ' + pf.warnings.join(' | '));
  return L.join('\n');
}

/**
 * (Apps Script) Dry-run : parse un texte CSV et retourne le preflight SANS rien
 * ecrire. Point d'entree unique d'apercu d'import.
 * @param {string} csvText
 * @param {string} [niveau]  defaut = getNiveau()
 * @returns {Object} { eleves, preflight, resume }
 */
function previewImportEdtCsv(csvText, niveau) {
  var niv = niveau || (typeof getNiveau === 'function' ? getNiveau() : null);
  var rows = parseCsvText(csvText);
  var res = parseEdt(rows, { niveau: niv });
  res.resume = resumePreflight(res.preflight);
  return res;
}

// --- helpers internes ---
function vide_() { return { absent: 0, vide: 0, present: 0 }; }
function normSexe_(s) {
  var u = String(s || '').trim().toUpperCase();
  if (u === 'G' || u === 'M' || u === 'H') return 'G';
  if (u === 'F') return 'F';
  return u;
}
function inferNiveauMajoritaire_(dataRows, map) {
  var counts = {};
  for (var i = 0; i < dataRows.length; i++) {
    var n = parseMef(cell_(map, 'MEF_PREV', dataRows[i])).niveau;
    if (n) counts[n] = (counts[n] || 0) + 1;
  }
  var keys = Object.keys(counts);
  if (!keys.length) return null;
  keys.sort(function (a, b) { return counts[b] - counts[a]; });
  return keys[0];
}

// Export Node pour les tests.
if (typeof module !== 'undefined' && module.exports) {
  // En Node, recharger les dependances pures de Score/Config.
  try {
    var _s = require('./Score.gs');
    if (typeof letterToScore === 'undefined') { letterToScore = _s.letterToScore; }
    if (typeof scoreComposite === 'undefined') { scoreComposite = _s.scoreComposite; }
    if (typeof SCORE_MAPPING_DEFAULT === 'undefined') { SCORE_MAPPING_DEFAULT = _s.SCORE_MAPPING_DEFAULT; }
    var _c = require('./Config.gs');
    if (typeof normalizeNiveau === 'undefined') { normalizeNiveau = _c.normalizeNiveau; }
  } catch (e) { /* en GAS les globales existent deja */ }
  module.exports = {
    parseCsvText: parseCsvText,
    normalizeHeader_: normalizeHeader_,
    classifyHeader_: classifyHeader_,
    detectColumns: detectColumns,
    parseOptions: parseOptions,
    parseMef: parseMef,
    parseEdt: parseEdt,
    resumePreflight: resumePreflight
  };
}
