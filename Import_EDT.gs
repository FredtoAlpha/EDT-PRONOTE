/**
 * ===================================================================
 * Import_EDT.gs — Import du fichier EDT/PRONOTE (tel quel) en 5 niveaux
 * ===================================================================
 *
 * Lit le CSV EDT/PRONOTE avec ses VRAIES entetes (double en-tete), filtre par
 * niveau actif, mappe les criteres A-E -> 5-1, et ecrit les onglets sources au
 * format standard de l'outil (ID_ELEVE, NOM, PRENOM, NOM_PRENOM, SEXE, LV2, OPT,
 * COM, TRA, PART, ABS, DISPO, ASSO, DISSO, SOURCE), puis enchaine les helpers
 * existants (NOM_PRENOM+ID, consolidation, listes deroulantes).
 *
 * Mapping criteres : Niveau scolaire -> TRA, Comportement -> COM,
 * Absenteisme -> ABS, A definir -> PART. Echelle A=5, B=4, C=3, D=2, E=1.
 *
 * Le coeur (edtImportCore_) est PUR : multi-separateur (, ; tab), quote-aware,
 * testable hors Apps Script. C'est lui qui corrige le "0 eleve" (le fichier
 * colle depuis un tableur est separe par des tabulations, pas des virgules).
 * ===================================================================
 */

// =============================================================================
// COEUR PUR (testable Node)
// =============================================================================

/** A=5, B=4, C=3, D=2, E=1. '' si vide/inconnu (3 etats preserves). */
function edtLetterToScore_(v) {
  if (v === null || v === undefined) return '';
  var k = String(v).trim().toUpperCase();
  var map = { A: 5, B: 4, C: 3, D: 2, E: 1 };
  return map.hasOwnProperty(k) ? map[k] : '';
}

/** Detecte le separateur le plus probable d'une ligne (',' ';' ou tab). */
function edtDetectSep_(ligne) {
  var c = { ',': 0, ';': 0, '\t': 0 };
  var inQ = false;
  for (var i = 0; i < ligne.length; i++) {
    var ch = ligne[i];
    if (ch === '"') inQ = !inQ;
    else if (!inQ && c.hasOwnProperty(ch)) c[ch]++;
  }
  var best = ',', n = -1;
  for (var s in c) if (c[s] > n) { n = c[s]; best = s; }
  return best;
}

/** Decoupe un texte en lignes de champs, quote-aware, separateur donne. */
function edtParseCsv_(text, sep) {
  var rows = [], row = [], field = '', inQ = false, s = String(text);
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* ignore */ }
    else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Normalise un libelle d'en-tete : sans accents, MAJ, alphanum + espaces. */
function edtNormHeader_(s) {
  if (s === null || s === undefined) return '';
  var t = String(s);
  if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Cle semantique d'une colonne d'apres son libelle fusionne. */
function edtClassifyHeader_(label) {
  var h = edtNormHeader_(label);
  if (!h) return null;
  if (h.indexOf('NIVEAU SCOLAIRE') >= 0) return 'TRA';
  if (h.indexOf('COMPORTEMENT') >= 0) return 'COM';
  if (h.indexOf('ABSENT') >= 0) return 'ABS';
  if (h.indexOf('A DEFINIR') >= 0 || h === 'DEFINIR') return 'PART';
  if (h.indexOf('REGROUPE') >= 0) return 'ASSO';
  if (h.indexOf('SEPARE') >= 0) return 'DISSO';
  if (h.indexOf('VERROU') >= 0) return 'VERROU';
  if (h.indexOf('OPTIONS PREVISIONN') >= 0) return 'OPT_PREV';
  if (h.indexOf('OPTIONS PRECEDENT') >= 0) return 'OPT_PREC';
  if (h.indexOf('MEF PREVISIONN') >= 0) return 'MEF_PREV';
  if (h.indexOf('ANCIEN MEF') >= 0) return 'ANCIEN_MEF';
  if (h.indexOf('CLASSE PREVISIONN') >= 0) return 'CLASSE_PREV';
  if (h.indexOf('ANCIENNE CLASSE') >= 0) return 'ANCIENNE_CLASSE';
  if (h.indexOf('SEXE') >= 0) return 'SEXE';
  if (h.indexOf('PRENOM') >= 0) return 'PRENOM';
  if (h.indexOf('NOM') >= 0) return 'NOM';
  return null;
}

/** Chiffre de niveau (3..6) extrait de n'importe quelle ecriture. */
function edtNiveauDigit_(v) {
  var m = String(v || '').match(/([3-6])/);
  return m ? m[1] : null;
}

/** parseOptions de secours si Backend_ImportDB.parseOptions_ absent (tests Node). */
function edtParseOptionsFallback_(str) {
  var r = { lv2: '', opt: '' };
  if (!str) return r;
  var parts = String(str).toUpperCase().split(',');
  var langs = { ESPAGNOL: 'ESP', ALLEMAND: 'ALL', ITALIEN: 'ITA' };
  var opts = ['LATIN', 'GREC', 'CHAV'];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p.indexOf('LV2') >= 0) { for (var l in langs) if (p.indexOf(l) >= 0) r.lv2 = langs[l]; }
    else if (p.indexOf('LV1') < 0) {
      if (p.indexOf('LATIN') >= 0 || p.indexOf('LCA') >= 0) r.opt = r.opt || 'LATIN';
      else if (p.indexOf('GREC') >= 0) r.opt = r.opt || 'GREC';
      else if (p.indexOf('CHANT') >= 0 || p.indexOf('CHORAL') >= 0) r.opt = r.opt || 'CHAV';
    }
  }
  return r;
}

function edtNormClasseFallback_(c) {
  if (!c) return '';
  return String(c).trim().replace(/(\d+)\s*[eèéE]\s*(\d+)/i, '$1°$2');
}

/**
 * COEUR PUR de l'import EDT.
 * @param {string} text       contenu du fichier EDT/PRONOTE
 * @param {string} niveauActif "3e", "3°", "3EME"...
 * @returns {{eleves:Array, parClasse:Object, stats:Object, warnings:string[], sep:string, cols:Object}}
 */
function edtImportCore_(text, niveauActif) {
  var lignes = String(text).replace(/^﻿/, '').split(/\r?\n/);
  var premiere = '';
  for (var i = 0; i < lignes.length; i++) { if (lignes[i].trim() !== '') { premiere = lignes[i]; break; } }
  var sep = edtDetectSep_(premiere);
  var rows = edtParseCsv_(text, sep);
  var warnings = [];
  if (rows.length < 3) return { eleves: [], parClasse: {}, stats: { lu: 0 }, warnings: ['Fichier trop court.'], sep: sep, cols: {} };

  // Double en-tete : fusion (ligne 2 prioritaire pour les sous-colonnes Criteres)
  var h1 = rows[0], h2 = rows[1];
  var n = Math.max(h1.length, h2.length), cols = {};
  for (var c = 0; c < n; c++) {
    var label = (h2[c] && String(h2[c]).trim() !== '') ? h2[c] : h1[c];
    var key = edtClassifyHeader_(label);
    if (key && !(key in cols)) cols[key] = c;
  }
  var manquantes = ['NOM', 'PRENOM', 'MEF_PREV'].filter(function (k) { return !(k in cols); });
  if (manquantes.length) warnings.push('Colonnes essentielles absentes: ' + manquantes.join(', ') + ' (separateur detecte: "' + (sep === '\t' ? 'TAB' : sep) + '").');

  var nivDigit = edtNiveauDigit_(niveauActif);
  // Pool des entrants (autre etab. / classe d'origine non standard) : on lui donne
  // un nom reconnu par TOUTE la structure (chiffre du niveau + numero hors plage,
  // ex. "4°99"). Ainsi ces eleves entrent dans la consolidation, les stats et le
  // sac de billes de la distribution, au lieu d'etre ignores (onglet "ENTRANTS").
  var entrantsSheetName = nivDigit ? (nivDigit + '°99') : 'ENTRANTS';
  function cell(row, key) { return (key in cols && row[cols[key]] != null) ? String(row[cols[key]]).trim() : ''; }

  var parseOpt = (typeof parseOptions_ === 'function') ? parseOptions_ : edtParseOptionsFallback_;
  var normClasse = (typeof normaliserClasse_ === 'function') ? normaliserClasse_ : edtNormClasseFallback_;

  var eleves = [], parClasse = {}, lu = 0, gardes = 0, filtres = 0;
  for (var r = 2; r < rows.length; r++) {
    var row = rows[r];
    var nom = cell(row, 'NOM'), prenom = cell(row, 'PRENOM');
    if (nom === '' && prenom === '') continue; // ligne vide
    lu++;

    // Filtrage par niveau (MEF previsionnel ; repli sur ancien MEF)
    var mefDigit = edtNiveauDigit_(cell(row, 'MEF_PREV')) || edtNiveauDigit_(cell(row, 'ANCIEN_MEF'));
    if (nivDigit && mefDigit && mefDigit !== nivDigit) { filtres++; continue; }

    var optStr = cell(row, 'OPT_PREV') || cell(row, 'OPT_PREC');
    var lo = parseOpt(optStr) || { lv2: '', opt: '' };
    var sexe = cell(row, 'SEXE').toUpperCase();
    if (sexe === 'G' || sexe === 'H') sexe = 'M'; // Pronote F/G -> etablissement F/M
    var verrou = cell(row, 'VERROU');
    // Classe d'origine. Les entrants (autre etablissement, classe vide ou non
    // standard type "403"/"4C") sont regroupes dans un onglet dedie "ENTRANTS".
    var clNorm = normClasse(cell(row, 'ANCIENNE_CLASSE'));
    var classe = /^\d\s*°\s*\d+$/.test(clNorm) ? clNorm.replace(/\s/g, '') : entrantsSheetName;

    var el = {
      nom: nom, prenom: prenom, sexe: sexe,
      lv1: 'ANGLAIS', // LV1 = ANGLAIS par defaut (etablissement)
      lv2: lo.lv2 || '', opt: lo.opt || '',
      com: edtLetterToScore_(cell(row, 'COM')),
      tra: edtLetterToScore_(cell(row, 'TRA')),
      part: edtLetterToScore_(cell(row, 'PART')),
      abs: edtLetterToScore_(cell(row, 'ABS')),
      dispo: (verrou !== '' && verrou.toUpperCase() !== 'NON' && verrou !== '0') ? 'FIXE' : '',
      asso: cell(row, 'ASSO'), disso: cell(row, 'DISSO'),
      classe: classe
    };
    eleves.push(el);
    (parClasse[classe] = parClasse[classe] || []).push(el);
    gardes++;
  }

  // Pool des entrants = eleves sans classe d'origine exploitable (autre etab.)
  if (parClasse[entrantsSheetName]) {
    warnings.push(parClasse[entrantsSheetName].length + ' eleve(s) sans classe d origine standard regroupes dans l onglet "' +
      entrantsSheetName + '" (reconnu par la structure ; a repartir).');
  }

  return {
    eleves: eleves, parClasse: parClasse, sep: sep, cols: cols, warnings: warnings,
    stats: { lu: lu, gardes: gardes, filtres: filtres, nbClasses: Object.keys(parClasse).length }
  };
}

// =============================================================================
// ECRITURE (Apps Script) — onglets sources au format standard
// =============================================================================

var EDT_SOURCE_HEADERS = ['ID_ELEVE', 'NOM', 'PRENOM', 'NOM_PRENOM', 'SEXE', 'LV2', 'OPT',
  'COM', 'TRA', 'PART', 'ABS', 'DISPO', 'ASSO', 'DISSO', 'SOURCE'];

/**
 * Importe le fichier EDT/PRONOTE et ecrit les onglets sources, puis enchaine
 * les helpers existants. Renvoie un resume pour l'UI.
 * @param {string} csvText
 * @param {string} [niveauActif] defaut = niveau lu dans _CONFIG
 * @returns {{ok:boolean, resume:string, stats:Object, warnings:string[], onglets:string[], message?:string}}
 */
function importerEDT_(csvText, niveauActif) {
  try {
    if (!niveauActif) {
      niveauActif = (typeof lireNiveauDepuisConfig === 'function') ? lireNiveauDepuisConfig() : '';
    }
    var res = edtImportCore_(csvText, niveauActif);
    if (res.stats.gardes === 0) {
      return { ok: false, message: 'Aucun eleve retenu pour le niveau ' + niveauActif +
        '. ' + (res.warnings.join(' ') || ''), stats: res.stats, warnings: res.warnings, onglets: [] };
    }

    var ss = SpreadsheetApp.getActive();
    var ruleCRIT = SpreadsheetApp.newDataValidation()
      .requireValueInList(['', '1', '2', '3', '4', '5'], true).setAllowInvalid(false).build();
    var onglets = [];

    for (var classe in res.parClasse) {
      var sheet = ss.getSheetByName(classe) || ss.insertSheet(classe);
      sheet.clear();
      sheet.getRange(1, 1, 1, EDT_SOURCE_HEADERS.length).setValues([EDT_SOURCE_HEADERS]);
      sheet.getRange(1, 1, 1, EDT_SOURCE_HEADERS.length).setFontWeight('bold').setBackground('#d9ead3').setFontSize(10);
      sheet.setFrozenRows(1);
      var rows = res.parClasse[classe].map(function (e) {
        return ['', e.nom, e.prenom, '', e.sexe, e.lv2, e.opt,
          e.com === '' ? '' : String(e.com), e.tra === '' ? '' : String(e.tra),
          e.part === '' ? '' : String(e.part), e.abs === '' ? '' : String(e.abs),
          e.dispo, e.asso, e.disso, classe];
      });
      if (rows.length) {
        sheet.getRange(2, 1, rows.length, EDT_SOURCE_HEADERS.length).setValues(rows);
        // Couleurs des scores 1-5 : 1 rouge, 2 orange, 3 jaune, 4 vert clair, 5 vert fonce
        var scoreBg = { '1': '#FF0000', '2': '#F6B26B', '3': '#FFD966', '4': '#93C47D', '5': '#38761D' };
        var scoreFg = { '1': '#FFFFFF', '2': '#000000', '3': '#000000', '4': '#000000', '5': '#FFFFFF' };
        var cfRules = sheet.getConditionalFormatRules();
        [8, 9, 10, 11].forEach(function (col) {
          var rng = sheet.getRange(2, col, rows.length, 1);
          rng.setDataValidation(ruleCRIT);
          ['1', '2', '3', '4', '5'].forEach(function (s) {
            cfRules.push(SpreadsheetApp.newConditionalFormatRule()
              .whenTextEqualTo(s).setBackground(scoreBg[s]).setFontColor(scoreFg[s]).setBold(true)
              .setRanges([rng]).build());
          });
        });
        sheet.setConditionalFormatRules(cfRules);
      }
      onglets.push(classe);
    }

    SpreadsheetApp.flush();
    try { if (typeof genererNomPrenomEtID === 'function') genererNomPrenomEtID(); } catch (e) { Logger.log('genererNomPrenomEtID: ' + e); }
    try { if (typeof consoliderDonnees === 'function') consoliderDonnees(); } catch (e) { Logger.log('consoliderDonnees: ' + e); }
    try { if (typeof ajouterListesDeroulantes === 'function') ajouterListesDeroulantes(); } catch (e) { Logger.log('ajouterListesDeroulantes: ' + e); }

    var resume = 'Niveau ' + niveauActif + ' — ' + res.stats.lu + ' lus, ' + res.stats.gardes +
      ' gardes, ' + res.stats.filtres + ' filtres (autre niveau). ' +
      res.stats.nbClasses + ' onglet(s) source : ' + onglets.join(', ') + '.' +
      (res.warnings.length ? '\n⚠ ' + res.warnings.join('\n⚠ ') : '');
    return { ok: true, resume: resume, stats: res.stats, warnings: res.warnings, onglets: onglets };
  } catch (e) {
    return { ok: false, message: 'Erreur import EDT : ' + e, warnings: [], onglets: [] };
  }
}

/** Apercu (dry-run) sans ecrire : pour le bouton "Analyser". */
function apiApercuEDT(csvText, niveauActif) {
  if (!niveauActif) niveauActif = (typeof lireNiveauDepuisConfig === 'function') ? lireNiveauDepuisConfig() : '';
  var res = edtImportCore_(csvText, niveauActif);
  return {
    ok: true, niveau: niveauActif, stats: res.stats, warnings: res.warnings,
    sep: res.sep === '\t' ? 'TAB' : res.sep,
    apercu: res.eleves.slice(0, 8).map(function (e) {
      return e.nom + ' ' + e.prenom + ' (' + e.sexe + ') ' + e.classe +
        ' COM' + e.com + ' TRA' + e.tra + ' PART' + e.part + ' ABS' + e.abs;
    })
  };
}

/** Appelee par l'UI : lit le niveau de _CONFIG et importe. */
function apiImporterEDT(csvText) {
  var niv = (typeof lireNiveauDepuisConfig === 'function') ? lireNiveauDepuisConfig() : '';
  return importerEDT_(csvText, niv);
}

/** Ouvre la boite d'import EDT (glisser-deposer + collage). */
function ouvrirImportEDT() {
  var html = HtmlService.createHtmlOutputFromFile('ImportEDT_Dialog')
    .setWidth(720).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Importer un fichier EDT/PRONOTE');
}

// Export Node (tests).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    edtLetterToScore_: edtLetterToScore_,
    edtDetectSep_: edtDetectSep_,
    edtParseCsv_: edtParseCsv_,
    edtClassifyHeader_: edtClassifyHeader_,
    edtImportCore_: edtImportCore_
  };
}
