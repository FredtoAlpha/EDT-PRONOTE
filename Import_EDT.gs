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

// =============================================================================
// MODE PRIMAIRE (entrants 6e) — branche PRIMAIRE
// L'export prévisionnel des futurs 6e n'a que 3 lettres (A/B/C), des noms
// fusionnés (« ABTAOUI Ranya »), et « Ancienne classe » = ÉCOLE PRIMAIRE.
// =============================================================================

var EDT_PRIMAIRE_CONFIG = {
  prefixe: '7°',                 // pseudo-niveau « école primaire » (7°1, 7°2, …)
  minParEcole: 4,                // écoles plus petites → regroupées dans le dernier onglet
  lv2Map: { 'ITALIEN': 'ITA', 'ITA': 'ITA' },
  optMap: { 'CHAV': 'CHAV' },
  dispositifs: ['ULIS', 'UPE2A', 'AESH'],
  classeImposeeParDispo: { 'ULIS': '6°1|6°4' }   // structure 26-27 : 2 ULIS en 6°1 + 2 en 6°4
};

/** Échelle 6e : A=5 (tête), B=3, C=1 (fragile). Vide/inconnu = 3 (profil neutre)
 *  — 3 lettres seulement en primaire : il faut des extrêmes francs pour que le
 *  maximin têtes/fonds ait de la matière. */
function edtLetterToScorePrimaire_(v) {
  var k = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  var map = { A: 5, B: 3, C: 1 };
  return map.hasOwnProperty(k) ? map[k] : 3;
}

/** Sépare « NOM EN CAPITALES Prénom » (tolère la casse mixte type « ISSERTEs »). */
function edtSplitNomPrenom_(full) {
  var toks = String(full || '').trim().split(/\s+/);
  var nomToks = toks.filter(function (t) { return t.length >= 2 && t.slice(0, 2) === t.slice(0, 2).toUpperCase() && /[A-ZÀ-Ý]/.test(t.charAt(0)); });
  var preToks = toks.filter(function (t) { return nomToks.indexOf(t) === -1; });
  return { nom: (nomToks.length ? nomToks : [toks[0] || '']).join(' '), prenom: preToks.join(' ') };
}

/** École normalisée pour le regroupement (tolère un « 7°X » déjà transformé). */
function edtEcoleNormalisee_(v) {
  var e = String(v || '').trim().toUpperCase();
  var p = EDT_PRIMAIRE_CONFIG.prefixe;
  if (e.indexOf(p) === 0) e = e.slice(p.length);
  return e;
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
  // 4e critere (libre dans Pronote, renommable) : « À définir » par defaut,
  // ou renomme par l'etablissement en « Participation » / « Oral » (oral de langues).
  if (h.indexOf('A DEFINIR') >= 0 || h === 'DEFINIR' ||
      h.indexOf('PARTICIPATION') >= 0 || h.indexOf('ORAL') >= 0) return 'PART';
  if (h.indexOf('REGROUPE') >= 0) return 'ASSO';
  if (h.indexOf('SEPARE') >= 0) return 'DISSO';
  if (h.indexOf('VERROU') >= 0) return 'VERROU';
  if (h.indexOf('DISPOSITIF') >= 0 || h === 'DISPO' || h.indexOf('ACCOMPAGNEMENT') >= 0) return 'DISPOSITIF';
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
 * @param {string} niveauActif "3e", "3°", "3EME"... (niveau attendu, filtrage)
 * @param {string} [typeImport] 'prev' (classes previsionnelles) ou 'base'
 *                 (base actuelle). Defaut: 'prev'. Determine la colonne de
 *                 classe et de niveau utilisees, donc le niveau des onglets.
 * @returns {{eleves:Array, parClasse:Object, stats:Object, warnings:string[], sep:string, cols:Object, typeImport:string}}
 */
function edtImportCore_(text, niveauActif, typeImport) {
  typeImport = (typeImport === 'base') ? 'base' : (typeImport === 'primaire' ? 'primaire' : 'prev');
  // Selon le type : quelle colonne porte la classe et le niveau (MEF).
  // 'primaire' : « Ancienne classe » = ÉCOLE d'origine (pas une classe X°N).
  var colClasse = (typeImport === 'prev') ? 'CLASSE_PREV' : 'ANCIENNE_CLASSE';
  var colClasseReplis = (typeImport === 'prev') ? 'ANCIENNE_CLASSE' : 'CLASSE_PREV';
  var colMef = (typeImport === 'prev') ? 'MEF_PREV' : 'ANCIEN_MEF';
  var colMefReplis = (typeImport === 'prev') ? 'ANCIEN_MEF' : 'MEF_PREV';

  var lignes = String(text).replace(/^﻿/, '').split(/\r?\n/);
  var premiere = '';
  for (var i = 0; i < lignes.length; i++) { if (lignes[i].trim() !== '') { premiere = lignes[i]; break; } }
  var sep = edtDetectSep_(premiere);
  var rows = edtParseCsv_(text, sep);
  var warnings = [];
  if (rows.length < 3) return { eleves: [], parClasse: {}, stats: { lu: 0 }, warnings: ['Fichier trop court.'], sep: sep, cols: {}, typeImport: typeImport };

  // Double en-tete : fusion (ligne 2 prioritaire pour les sous-colonnes Criteres)
  var h1 = rows[0], h2 = rows[1];
  var n = Math.max(h1.length, h2.length), cols = {};
  for (var c = 0; c < n; c++) {
    var label = (h2[c] && String(h2[c]).trim() !== '') ? h2[c] : h1[c];
    var key = edtClassifyHeader_(label);
    if (key && !(key in cols)) cols[key] = c;
  }
  var colClasseEffective = (colClasse in cols) ? colClasse : ((colClasseReplis in cols) ? colClasseReplis : colClasse);
  var manquantes = ['NOM', 'PRENOM'].filter(function (k) { return !(k in cols); });
  if (!(colClasse in cols) && !(colClasseReplis in cols)) manquantes.push(colClasse);
  if (manquantes.length) warnings.push('Colonnes essentielles absentes: ' + manquantes.join(', ') + ' (separateur detecte: "' + (sep === '\t' ? 'TAB' : sep) + '").');

  // Niveau cible = celui qu'on CONSTRUIT (config). Les sources different selon le type :
  //  - previsionnel : classes deja au niveau cible (ex. on construit des 3°, le
  //    previsionnel contient des 3°)  -> on filtre sur le niveau cible.
  //  - base actuelle : classes du niveau juste au-dessus (on construit des 3° a
  //    partir des 4° actuels) -> on filtre sur cible + 1.
  var nivCible = edtNiveauDigit_(niveauActif);
  var nivDigit = nivCible; // niveau attendu dans le fichier (pour le filtrage)
  if (typeImport === 'base' && nivCible) {
    nivDigit = String(parseInt(nivCible, 10) + 1); // 3 -> 4, 5 -> 6, etc.
  }
  if (typeImport === 'primaire') {
    nivDigit = null; // pas de filtrage MEF : les CM2 n'ont pas de niveau 3-6
  }
  // Le niveau des onglets/entrants suit le niveau REEL des classes de l'import.
  var nivEntrants = nivDigit;
  function cell(row, key) { return (key in cols && row[cols[key]] != null) ? String(row[cols[key]]).trim() : ''; }

  var parseOpt = (typeof parseOptions_ === 'function') ? parseOptions_ : edtParseOptionsFallback_;
  var normClasse = (typeof normaliserClasse_ === 'function') ? normaliserClasse_ : edtNormClasseFallback_;

  var eleves = [], parClasse = {}, lu = 0, gardes = 0, filtres = 0;
  var entrantsRaw = [];
  for (var r = 2; r < rows.length; r++) {
    var row = rows[r];
    var nom = cell(row, 'NOM'), prenom = cell(row, 'PRENOM');
    if (nom === '' && prenom === '') continue; // ligne vide
    lu++;

    // PRIMAIRE : noms fusionnés (« ABTAOUI Ranya ») → scinder si Prénom vide
    if (typeImport === 'primaire' && !prenom && nom) {
      var sp = edtSplitNomPrenom_(nom);
      nom = sp.nom; prenom = sp.prenom;
    }

    // Filtrage par niveau (colonne MEF du type choisi ; repli sur l'autre)
    var mefDigit = edtNiveauDigit_(cell(row, colMef)) || edtNiveauDigit_(cell(row, colMefReplis));
    if (nivDigit && mefDigit && mefDigit !== nivDigit) { filtres++; continue; }

    var optStr = cell(row, 'OPT_PREV') || cell(row, 'OPT_PREC');
    var lo = parseOpt(optStr) || { lv2: '', opt: '' };
    var dispoPrimaire = '';
    if (typeImport === 'primaire') {
      // 6e : une seule valeur brute (ITALIEN / CHAV / ULIS / UPE2A / AESH)
      var optU = String(optStr || '').trim().toUpperCase();
      lo = {
        lv2: EDT_PRIMAIRE_CONFIG.lv2Map[optU] || '',
        opt: EDT_PRIMAIRE_CONFIG.optMap[optU] || ''
      };
      if (EDT_PRIMAIRE_CONFIG.dispositifs.indexOf(optU) >= 0) dispoPrimaire = optU;
    }
    // DEFENSE : cohorte (drapeau d'affichage). Détectée dans la liste d'options
    // mais NON stockée dans OPT (qui reste l'option réelle : LATIN…) → canaux
    // séparés, un élève peut cumuler LATIN (OPT) + DEFENSE (drapeau). Le
    // PLACEMENT de la cohorte est géré par la classe imposée (colonne H).
    var defense = (String(optStr).toUpperCase().indexOf('DEFENSE') >= 0) ? 'OUI' : '';
    var sexe = cell(row, 'SEXE').toUpperCase();
    if (sexe === 'G' || sexe === 'H') sexe = 'M'; // Pronote F/G -> etablissement F/M
    // Dispositif (PAP/GEVASCO/PAI/ULIS…) : information affichée en badge, sans
    // effet moteur. Marqueur unique (priorité via parseDispo_ si plusieurs ;
    // repli sur la valeur brute pour un code non listé). Remplace l'ancien
    // verrou 'FIXE' (vestigial : DISPO n'était jamais relu comme lock en aval).
    var dispoRaw = cell(row, 'DISPOSITIF');
    var dispoVal = dispoRaw
      ? (((typeof parseDispo_ === 'function') ? parseDispo_(dispoRaw) : '') || dispoRaw.trim())
      : '';
    if (typeImport === 'primaire' && dispoPrimaire) dispoVal = dispoVal || dispoPrimaire;
    // Classe (du type d'import choisi). Les entrants (autre etablissement, classe
    // vide ou non standard type "403"/"4C") sont regroupes dans un onglet dedie.
    var clNorm = normClasse(cell(row, colClasseEffective));
    var classeStd = /^\d\s*°\s*\d+$/.test(clNorm);
    var classe = classeStd ? clNorm.replace(/\s/g, '') : null; // null = entrant (resolu apres)
    if (typeImport === 'primaire') {
      // La « classe » d'origine est l'ÉCOLE : regroupée puis renumérotée 7°N après la boucle
      classe = edtEcoleNormalisee_(cell(row, colClasseEffective)) || 'AUTRE';
    }
    // Memoriser le niveau reel vu dans les classes standard (pour les entrants)
    if (classeStd && !nivEntrants) {
      var dm = clNorm.match(/(\d)\s*°/);
      if (dm) nivEntrants = dm[1];
    }

    // Classe(s) imposée(s) — colonne « Classe prévisionnelle » (libre en montée
    // 'base'). UNE seule (ex. "3°2") OU plusieurs au choix séparées par '|'
    // (ex. "3°1|3°2"). Normalisées ; formes invalides écartées ; vide = le
    // moteur décide. En mode 'prev', CLASSE_PREV EST déjà la classe d'origine
    // → pas d'imposition séparée.
    var classeImposee = '';
    if (typeImport === 'primaire') {
      // 6e : classe(s) imposée(s) par dispositif (ex. ULIS → 6°1|6°4, cf. structure)
      classeImposee = (dispoPrimaire && EDT_PRIMAIRE_CONFIG.classeImposeeParDispo[dispoPrimaire]) || '';
    }
    if (typeImport === 'base') {
      classeImposee = String(cell(row, 'CLASSE_PREV') || '')
        .split('|')
        .map(function (c) { return normClasse(c.trim()).replace(/\s/g, ''); })
        .filter(function (c) { return /^\d°\d+$/.test(c); })
        .join('|');
    }

    var el = {
      nom: nom, prenom: prenom, sexe: sexe,
      lv1: 'ANGLAIS', // LV1 = ANGLAIS par defaut (etablissement)
      lv2: lo.lv2 || '', opt: lo.opt || '',
      // primaire : 3 lettres seulement → A=5/B=3/C=1, vide=3 (extrêmes francs
      // pour le maximin). Sinon : échelle EDT A-E classique.
      com: (typeImport === 'primaire') ? edtLetterToScorePrimaire_(cell(row, 'COM')) : edtLetterToScore_(cell(row, 'COM')),
      tra: (typeImport === 'primaire') ? edtLetterToScorePrimaire_(cell(row, 'TRA')) : edtLetterToScore_(cell(row, 'TRA')),
      part: (typeImport === 'primaire') ? edtLetterToScorePrimaire_(cell(row, 'PART')) : edtLetterToScore_(cell(row, 'PART')),
      abs: (typeImport === 'primaire') ? edtLetterToScorePrimaire_(cell(row, 'ABS')) : edtLetterToScore_(cell(row, 'ABS')),
      dispo: dispoVal,
      asso: cell(row, 'ASSO'), disso: cell(row, 'DISSO'),
      classeImposee: classeImposee,
      defense: defense,
      classe: classe
    };
    eleves.push(el);
    if (classe) { (parClasse[classe] = parClasse[classe] || []).push(el); }
    else { entrantsRaw.push(el); }
    gardes++;
  }

  // PRIMAIRE : renuméroter les écoles en onglets 7°1..7°N (effectif décroissant),
  // les écoles < minParEcole regroupées dans le dernier onglet. La légende
  // école → onglet part dans les warnings (affichée par l'UI d'import).
  if (typeImport === 'primaire') {
    var cfgP = EDT_PRIMAIRE_CONFIG;
    var noms = Object.keys(parClasse);
    var grandes = noms.filter(function (k) { return parClasse[k].length >= cfgP.minParEcole; })
      .sort(function (a, b) { return parClasse[b].length - parClasse[a].length; });
    var petites = noms.filter(function (k) { return parClasse[k].length < cfgP.minParEcole; }).sort();
    var renum = {}, legende = [];
    grandes.forEach(function (k, i) {
      var o = cfgP.prefixe + (i + 1);
      renum[o] = parClasse[k];
      legende.push(o + ' = ' + k + ' (' + parClasse[k].length + ')');
    });
    if (petites.length) {
      var oFusion = cfgP.prefixe + (grandes.length + 1);
      renum[oFusion] = [];
      petites.forEach(function (k) { renum[oFusion] = renum[oFusion].concat(parClasse[k]); });
      legende.push(oFusion + ' = ' + petites.join(' + ') + ' (' + renum[oFusion].length + ')');
    }
    for (var oN in renum) { renum[oN].forEach(function (e) { e.classe = oN; }); }
    parClasse = renum;
    warnings.push('Écoles d\'origine → onglets sources : ' + legende.join(' · '));
    var sansSexe = eleves.filter(function (e) { return e.sexe !== 'F' && e.sexe !== 'M'; }).length;
    if (sansSexe) warnings.push('⚠ ' + sansSexe + ' élève(s) SANS SEXE — la parité sera faussée, complétez avant génération.');
  }

  // Affecter les entrants a un onglet au MEME niveau que les classes (ex. 3°99).
  var entrantsSheetName = (nivEntrants ? (nivEntrants + '°99') : 'ENTRANTS');
  if (entrantsRaw.length) {
    entrantsRaw.forEach(function (el) { el.classe = entrantsSheetName; });
    parClasse[entrantsSheetName] = (parClasse[entrantsSheetName] || []).concat(entrantsRaw);
    warnings.push(entrantsRaw.length + ' eleve(s) sans classe d origine standard regroupes dans l onglet "' +
      entrantsSheetName + '" (reconnu par la structure ; a repartir).');
  }

  return {
    eleves: eleves, parClasse: parClasse, sep: sep, cols: cols, warnings: warnings, typeImport: typeImport,
    stats: { lu: lu, gardes: gardes, filtres: filtres, nbClasses: Object.keys(parClasse).length }
  };
}

// =============================================================================
// ECRITURE (Apps Script) — onglets sources au format standard
// =============================================================================

var EDT_SOURCE_HEADERS = ['ID_ELEVE', 'NOM', 'PRENOM', 'NOM_PRENOM', 'SEXE', 'LV2', 'OPT',
  'COM', 'TRA', 'PART', 'ABS', 'DISPO', 'ASSO', 'DISSO', 'SOURCE', 'CLASSE_IMPOSEE', 'DEFENSE'];

/**
 * Importe le fichier EDT/PRONOTE et ecrit les onglets sources, puis enchaine
 * les helpers existants. Renvoie un resume pour l'UI.
 * @param {string} csvText
 * @param {string} [niveauActif] defaut = niveau lu dans _CONFIG
 * @returns {{ok:boolean, resume:string, stats:Object, warnings:string[], onglets:string[], message?:string}}
 */
function importerEDT_(csvText, niveauActif, typeImport) {
  try {
    if (!niveauActif) {
      niveauActif = (typeof lireNiveauDepuisConfig === 'function') ? lireNiveauDepuisConfig() : '';
    }
    var res = edtImportCore_(csvText, niveauActif, typeImport);
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
          e.dispo, e.asso, e.disso, classe, e.classeImposee || '', e.defense || ''];
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

    // MODE PRIMAIRE — HYGIÈNE DES SOURCES. La consolidation ramasse TOUS les
    // onglets X°N : des résidus d'imports précédents (ECOLE°1…, ancien
    // regroupement 7°8…) seraient MÉLANGÉS aux 7°N — et le premier onglet
    // trouvé impose son en-tête à CONSOLIDATION (colonnes désorganisées).
    if (typeImport === 'primaire') {
      var etrangers = [];
      ss.getSheets().forEach(function (sh) {
        var nm = sh.getName();
        if (!/.+°\d+$/.test(nm) || onglets.indexOf(nm) >= 0) return;
        if (/^7°\d+$/.test(nm)) {
          ss.deleteSheet(sh);   // résidu 7°N d'un import 6e précédent → purgé
          res.warnings.push('Onglet 7° périmé supprimé : ' + nm + '.');
        } else {
          etrangers.push(nm);   // ECOLE°1, 6°1… : pas à nous, on ne détruit pas
        }
      });
      if (etrangers.length) {
        SpreadsheetApp.flush();
        res.warnings.push('⛔ ONGLETS SOURCES ÉTRANGERS détectés : ' + etrangers.join(', ') +
          ' — la consolidation les mélangerait aux onglets 7°N (colonnes désorganisées, effectifs faux). ' +
          'CONSOLIDATION NON LANCÉE. Purgez l\'import (bouton « TOUT PURGER ») ou supprimez ces onglets, puis relancez cet import.');
        return {
          ok: true,
          resume: 'Onglets 7°N écrits (' + onglets.join(', ') + ') mais consolidation SUSPENDUE : onglets étrangers à purger.\n⚠ ' + res.warnings.join('\n⚠ '),
          stats: res.stats, warnings: res.warnings, onglets: onglets
        };
      }
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

/** Apercu (dry-run) sans ecrire : pour le bouton "Analyser".
 * @param {string} typeImport 'prev' (previsionnel) ou 'base' (base actuelle). */
function apiApercuEDT(csvText, niveauActif, typeImport) {
  if (!niveauActif) niveauActif = (typeof lireNiveauDepuisConfig === 'function') ? lireNiveauDepuisConfig() : '';
  var res = edtImportCore_(csvText, niveauActif, typeImport);
  return {
    ok: true, niveau: niveauActif, typeImport: res.typeImport, stats: res.stats, warnings: res.warnings,
    sep: res.sep === '\t' ? 'TAB' : res.sep,
    apercu: res.eleves.slice(0, 8).map(function (e) {
      return e.nom + ' ' + e.prenom + ' (' + e.sexe + ') ' + e.classe +
        ' COM' + e.com + ' TRA' + e.tra + ' PART' + e.part + ' ABS' + e.abs;
    })
  };
}

/** Appelee par l'UI : lit le niveau de _CONFIG et importe.
 * @param {string} typeImport 'prev' (previsionnel) ou 'base' (base actuelle). */
function apiImporterEDT(csvText, typeImport) {
  var niv = (typeof lireNiveauDepuisConfig === 'function') ? lireNiveauDepuisConfig() : '';
  return importerEDT_(csvText, niv, typeImport);
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
