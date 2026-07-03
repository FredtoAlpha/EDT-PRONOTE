/**
 * ===================================================================
 * 🎒 PRIMAIRE — IMPORT DES ENTRANTS 6e (branche PRIMAIRE)
 * ===================================================================
 * Transforme l'export prévisionnel Pronote des futurs 6e (collé tel quel
 * dans l'onglet IMPORT6E) en onglets SOURCES standard « 7°1 », « 7°2 », …
 * prêts pour le pipeline LEGACY (7° = pseudo-niveau « école primaire »).
 *
 * Format d'entrée attendu (export Pronote « répartition prévisionnelle ») :
 *   ligne 1 : Nom | Prénom | Né(e) le | Sexe | Ancienne classe | Ancien MEF |
 *             … | Options prévisionnelles | Critères(3 col.) | … |
 *             Regroupé avec | Séparé de | Verrou
 *   ligne 2 : sous-en-têtes du bloc Critères (Niveau scolaire / Comportement /
 *             Absentéisme) — ignorée
 *   données : à partir de la ligne 3. Nom éventuellement fusionné
 *             (« ABTAOUI Ranya » : NOM en CAPITALES + prénom).
 *
 * Transformations :
 *   • Ancienne classe (école primaire) → onglets 7°1..7°N, numérotés par
 *     effectif décroissant ; écoles < minParEcole regroupées dans le dernier.
 *   • Lettres A/B/C → scores 1-5 : Comportement→COM, Niveau scolaire→TRA,
 *     Absentéisme→ABS, PART=3 (donnée absente en primaire).
 *   • Options : ITALIEN→LV2 ITA · CHAV→OPT · ULIS/UPE2A/AESH→DISPO
 *     (+ CLASSE_IMPOSEE configurable par dispositif, ex. ULIS → 6°1|6°4).
 *   • Regroupé avec→ASSO · Séparé de→DISSO (MULTI-CODES « D6 D7 » supportés
 *     par le moteur depuis cette branche) · Verrou→FIXE.
 *
 * Sortie : onglets 7°N (en-têtes standard) + onglet _IMPORT6E_LOG
 * (légende école→onglet + avertissements). Écritures en BLOC.
 *
 * Lancement : exécuter importerEntrants6e_PRIMAIRE() depuis l'éditeur.
 * ===================================================================
 */

const PRIMAIRE_CONFIG = {
  ongletImport: 'IMPORT6E',
  prefixeSource: '7°',
  minParEcole: 4,                       // en-dessous → regroupées ensemble
  scoreMap: { 'A': 5, 'B': 3, 'C': 1 },
  scoreDefaut: 3,                       // critère absent → profil neutre
  lv2Map: { 'ITALIEN': 'ITA', 'ITA': 'ITA' },
  optMap: { 'CHAV': 'CHAV' },
  dispositifs: ['ULIS', 'UPE2A', 'AESH'],
  classeImposeeParDispo: { 'ULIS': '6°1|6°4' }  // structure 26-27 : 2 ULIS en 6°1 + 2 en 6°4
};

/** Sépare « NOM EN CAPITALES Prénom » ; tolère un prénom déjà fourni à part. */
function nomPrenom6e_(nomComplet, prenomColonne) {
  const full = String(nomComplet || '').trim();
  const pre = String(prenomColonne || '').trim();
  if (pre) {
    // prénom fourni : le nom = le nom complet privé du prénom (s'il y figure)
    const nom = full.replace(pre, '').trim() || full;
    return { nom: nom, prenom: pre };
  }
  const toks = full.split(/\s+/);
  const nomToks = toks.filter(function (t) { return t.length >= 2 && t.slice(0, 2) === t.slice(0, 2).toUpperCase() && /[A-ZÀ-Ý]/.test(t[0]); });
  const preToks = toks.filter(function (t) { return nomToks.indexOf(t) === -1; });
  return {
    nom: (nomToks.length ? nomToks : [toks[0]]).join(' '),
    prenom: preToks.join(' ')
  };
}

/** Lettre A/B/C → score 1-5 (défaut si vide/inconnu). */
function score6e_(lettre) {
  const l = String(lettre || '').trim().toUpperCase();
  return PRIMAIRE_CONFIG.scoreMap[l] != null ? PRIMAIRE_CONFIG.scoreMap[l] : PRIMAIRE_CONFIG.scoreDefaut;
}

/** Nom d'école normalisé pour le regroupement (tolère un « 7°X » déjà transformé). */
function ecoleNormalisee6e_(val) {
  let e = String(val || '').trim().toUpperCase();
  if (e.indexOf(PRIMAIRE_CONFIG.prefixeSource) === 0) e = e.slice(PRIMAIRE_CONFIG.prefixeSource.length);
  return e;
}

function importerEntrants6e_PRIMAIRE() {
  const ss = SpreadsheetApp.getActive();
  const src = ss.getSheetByName(PRIMAIRE_CONFIG.ongletImport);
  if (!src) {
    const msg = '❌ Onglet "' + PRIMAIRE_CONFIG.ongletImport + '" introuvable : collez-y l\'export prévisionnel 6e.';
    logLine('ERROR', msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return { ok: false, error: msg };
  }
  const data = src.getDataRange().getValues();
  if (data.length < 3) return { ok: false, error: 'Onglet import vide' };

  // ---- Repérer les colonnes par leur nom (ligne 1) ----
  const H = data[0].map(function (h) { return String(h).trim().toUpperCase(); });
  const col = function (name) { return H.findIndex(function (h) { return h.indexOf(name.toUpperCase()) === 0; }); };
  const iNom = col('Nom'), iPre = col('Prénom'), iSexe = col('Sexe'), iEcole = col('Ancienne classe');
  const iOpt = col('Options prévisionnelles'), iCrit = col('Critères');
  const iAsso = col('Regroupé'), iDisso = col('Séparé'), iVerrou = col('Verrou');
  if (iNom === -1 || iEcole === -1) return { ok: false, error: 'En-têtes non reconnus (Nom / Ancienne classe manquants)' };
  // Bloc Critères : Niveau scolaire | Comportement | Absentéisme (3 colonnes contiguës)
  const iNiveau = iCrit, iComport = iCrit + 1, iAbsent = iCrit + 2;

  // ---- Lire et transformer les élèves ----
  const eleves = [];
  const warnings = [];
  let sansSexe = 0, sansCritere = 0, multiDisso = 0;
  for (let r = 2; r < data.length; r++) {   // ligne 3 et suivantes
    const full = String(data[r][iNom] || '').trim();
    if (!full) continue;
    const np = nomPrenom6e_(full, iPre >= 0 ? data[r][iPre] : '');
    const sexe = String(iSexe >= 0 ? data[r][iSexe] : '').trim().toUpperCase().charAt(0);
    if (sexe !== 'F' && sexe !== 'M') sansSexe++;
    const optBrut = String(iOpt >= 0 ? data[r][iOpt] : '').trim().toUpperCase();
    const lv2 = PRIMAIRE_CONFIG.lv2Map[optBrut] || '';
    const opt = PRIMAIRE_CONFIG.optMap[optBrut] || '';
    const dispo = PRIMAIRE_CONFIG.dispositifs.indexOf(optBrut) >= 0 ? optBrut : '';
    const niveau = String(iCrit >= 0 ? data[r][iNiveau] : '').trim();
    const comport = String(iCrit >= 0 ? data[r][iComport] : '').trim();
    const absent = String(iCrit >= 0 ? data[r][iAbsent] : '').trim();
    if (!niveau && !comport) sansCritere++;
    const disso = String(iDisso >= 0 ? data[r][iDisso] : '').trim().toUpperCase();
    if (dissoCodesOf_(disso).length > 1) multiDisso++;
    eleves.push({
      nom: np.nom, prenom: np.prenom, sexe: sexe === 'F' ? 'F' : (sexe === 'M' ? 'M' : ''),
      lv2: lv2, opt: opt, dispo: dispo,
      com: score6e_(comport), tra: score6e_(niveau), part: PRIMAIRE_CONFIG.scoreDefaut, abs: score6e_(absent),
      asso: String(iAsso >= 0 ? data[r][iAsso] : '').trim().toUpperCase(),
      disso: disso,
      imposee: PRIMAIRE_CONFIG.classeImposeeParDispo[dispo] || '',
      fixe: String(iVerrou >= 0 ? data[r][iVerrou] : '').trim() ? 'OUI' : '',
      ecole: ecoleNormalisee6e_(data[r][iEcole])
    });
  }
  if (!eleves.length) return { ok: false, error: 'Aucun élève lu' };

  // ---- Regrouper par école → onglets 7°1..7°N (effectif décroissant) ----
  const parEcole = {};
  eleves.forEach(function (e) {
    const k = e.ecole || 'AUTRE';
    (parEcole[k] = parEcole[k] || []).push(e);
  });
  const grandes = Object.keys(parEcole).filter(function (k) { return parEcole[k].length >= PRIMAIRE_CONFIG.minParEcole; })
    .sort(function (a, b) { return parEcole[b].length - parEcole[a].length; });
  const petites = Object.keys(parEcole).filter(function (k) { return parEcole[k].length < PRIMAIRE_CONFIG.minParEcole; }).sort();

  const groupes = grandes.map(function (k) { return { ecoles: [k], eleves: parEcole[k] }; });
  if (petites.length) {
    const fusion = { ecoles: petites, eleves: [] };
    petites.forEach(function (k) { fusion.eleves = fusion.eleves.concat(parEcole[k]); });
    groupes.push(fusion);
  }

  // ---- Écrire les onglets sources 7°N (en bloc) ----
  const HEADERS = ['ID_ELEVE', 'NOM', 'PRENOM', 'SEXE', 'LV2', 'OPT', 'COM', 'TRA', 'PART', 'ABS',
    'DISPO', 'ASSO', 'DISSO', 'CLASSE_IMPOSEE', 'FIXE'];
  const legende = [];
  let idSeq = 0;
  groupes.forEach(function (g, gi) {
    const nomOnglet = PRIMAIRE_CONFIG.prefixeSource + (gi + 1);
    let sh = ss.getSheetByName(nomOnglet);
    if (!sh) sh = ss.insertSheet(nomOnglet); else sh.clearContents();
    const rows = [HEADERS];
    g.eleves.forEach(function (e) {
      idSeq++;
      rows.push(['6E' + ('000' + idSeq).slice(-3), e.nom, e.prenom, e.sexe, e.lv2, e.opt,
        e.com, e.tra, e.part, e.abs, e.dispo, e.asso, e.disso, e.imposee, e.fixe]);
    });
    sh.getRange(1, 1, rows.length, HEADERS.length).setValues(rows);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#C6E0B4');
    legende.push([nomOnglet, g.eleves.length, g.ecoles.join(' + ')]);
    logLine('INFO', '  🎒 ' + nomOnglet + ' : ' + g.eleves.length + ' élèves (' + g.ecoles.join(' + ') + ')');
  });

  // ---- Journal / légende (en bloc) ----
  let log = ss.getSheetByName('_IMPORT6E_LOG');
  if (!log) log = ss.insertSheet('_IMPORT6E_LOG'); else log.clearContents();
  const out = [['🎒 IMPORT 6e — ' + new Date().toLocaleString('fr-FR'), '', ''],
    ['Onglet', 'Effectif', 'École(s) d\'origine']].concat(legende);
  out.push(['', '', '']);
  out.push(['TOTAL', eleves.length, '']);
  if (sansSexe) out.push(['⚠️ SEXE manquant', sansSexe, 'à compléter avant génération (parité faussée sinon)']);
  if (sansCritere) out.push(['⚠️ Sans critères', sansCritere, 'traités en profil neutre (COM/TRA/ABS = ' + PRIMAIRE_CONFIG.scoreDefaut + ')']);
  if (multiDisso) out.push(['ℹ️ Multi-codes DISSO', multiDisso, 'supportés par le moteur (branche PRIMAIRE)']);
  log.getRange(1, 1, out.length, 3).setValues(out);
  log.getRange(1, 1, 2, 3).setFontWeight('bold');

  logLine('INFO', '✅ Import 6e : ' + eleves.length + ' élèves → ' + groupes.length + ' onglets sources.' +
    (sansSexe ? ' ⚠️ ' + sansSexe + ' sans sexe.' : ''));
  return { ok: true, eleves: eleves.length, onglets: groupes.length, sansSexe: sansSexe, sansCritere: sansCritere };
}
