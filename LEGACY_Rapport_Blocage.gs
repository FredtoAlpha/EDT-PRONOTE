/**
 * ===================================================================
 * 🔒 RAPPORT DE BLOCAGE — onglet _BLOCAGE (branche 2028)
 * ===================================================================
 * Répond à LA question du conseil : « peut-on faire mieux en respectant
 * les options ? » — avec des chiffres, pas une croyance.
 *
 * Pour chaque classe et pour les extrêmes PURS de COM et TRA (5 = têtes,
 * 1 = fonds), le rapport compte combien d'élèves sont :
 *   • VERROUILLÉS  (mobilité FIXE/GROUPE_FIXE/ERREUR : 1 seule classe possible)
 *   • PERMUTABLES  (PERMUT : option offerte dans 2 classes)
 *   • LIBRES       (LIBRE ou statut vide : déplaçables partout)
 * et les compare à la part juste (cible proportionnelle du moteur).
 *
 * La SYNTHÈSE dit si le plafond structurel est atteint : s'il reste un
 * déficit quelque part ET que tous les surplus ailleurs sont verrouillés,
 * on ne peut PAS faire mieux sans toucher aux options. Sinon, elle chiffre
 * la marge résiduelle.
 *
 * Appelé en fin de pipeline (après le recalcul final de mobilité, donc sur
 * des statuts exacts). Écriture en BLOC (≈7 appels API, pas de formatage
 * cellule par cellule).
 * ===================================================================
 */

function genererRapportBlocage_LEGACY(ctx) {
  const ss = ctx.ss || SpreadsheetApp.getActive();

  // ---- 1. Lire les onglets TEST (un getValues par onglet) ----
  const students = [];   // { cls, com, tra, statut }
  (ctx.cacheSheets || []).forEach(function (testName) {
    const sheet = ss.getSheetByName(testName);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    const headers = data[0].map(function (h) { return String(h).trim(); });
    const iID = headers.indexOf('ID_ELEVE');
    const iCOM = headers.indexOf('COM');
    const iTRA = headers.indexOf('TRA');
    const iMOB = headers.indexOf('MOBILITE');
    if (iID === -1 || iCOM === -1) return;
    const cls = testName.replace(/TEST$/i, '');
    for (let r = 1; r < data.length; r++) {
      if (!String(data[r][iID] || '').trim()) continue;
      const mob = String(iMOB >= 0 ? data[r][iMOB] : '').toUpperCase().trim();
      const statut = (mob.indexOf('FIXE') >= 0 || mob.indexOf('ERREUR') >= 0) ? 'V'
        : (mob.indexOf('PERMUT') >= 0) ? 'P' : 'L';
      students.push({
        cls: cls,
        com: Number(data[r][iCOM]) || 2,
        tra: iTRA >= 0 ? (Number(data[r][iTRA]) || 2) : 2,
        statut: statut
      });
    }
  });
  if (!students.length) {
    logLine('WARN', '⚠️ Rapport de blocage : aucun élève lu dans les onglets TEST.');
    return { ok: false };
  }

  // ---- 2. Statistiques par classe et par critère ----
  const classes = [];
  const byCls = {};
  students.forEach(function (s) {
    if (!byCls[s.cls]) { byCls[s.cls] = []; classes.push(s.cls); }
    byCls[s.cls].push(s);
  });
  classes.sort();
  const total = students.length;

  function statsFor(critKey) {
    const get = function (s) { return critKey === 'COM' ? s.com : s.tra; };
    const glob5 = students.filter(function (s) { return get(s) >= 5; }).length;
    const glob1 = students.filter(function (s) { return get(s) <= 1; }).length;
    const rows = classes.map(function (cls) {
      const st = byCls[cls];
      const n = st.length;
      const f5 = st.filter(function (s) { return get(s) >= 5; });
      const f1 = st.filter(function (s) { return get(s) <= 1; });
      const count = function (arr, statut) { return arr.filter(function (s) { return s.statut === statut; }).length; };
      const cible5 = Math.floor(glob5 / total * n);   // plancher faisable (= cible moteur)
      const plafond1 = Math.ceil(glob1 / total * n);  // plafond faisable (= cap moteur)
      return {
        cls: cls, n: n,
        nb5: f5.length, v5: count(f5, 'V'), p5: count(f5, 'P'), l5: count(f5, 'L'),
        cible5: cible5, ecart5: f5.length - cible5,
        nb1: f1.length, v1: count(f1, 'V'), p1: count(f1, 'P'), l1: count(f1, 'L'),
        plafond1: plafond1, ecart1: f1.length - plafond1
      };
    });
    // Marge résiduelle : déficit total de 5 vs surplus DÉPLAÇABLE (permut+libre) ailleurs
    let deficit5 = 0, surplusMobile5 = 0, exces1 = 0, excesMobile1 = 0;
    rows.forEach(function (r) {
      if (r.ecart5 < 0) deficit5 += -r.ecart5;
      if (r.ecart5 > 0) surplusMobile5 += Math.min(r.ecart5, r.p5 + r.l5);
      if (r.ecart1 > 0) { exces1 += r.ecart1; excesMobile1 += Math.min(r.ecart1, r.p1 + r.l1); }
    });
    const marge5 = Math.min(deficit5, surplusMobile5);
    const verdict5 = deficit5 === 0 ? '✔ Cibles de têtes (' + critKey + '=5) atteintes partout'
      : marge5 === 0 ? '🔒 PLAFOND STRUCTUREL : déficit de ' + deficit5 + ' tête(s), mais tous les 5 en surplus sont VERROUILLÉS par les options'
        : '▲ MARGE POSSIBLE : ' + marge5 + ' élève(s) ' + critKey + '=5 déplaçable(s) en surplus (relancer avec un autre seed peut gagner)';
    const verdict1 = exces1 === 0 ? '✔ Aucun excès de fonds (' + critKey + '=1)'
      : excesMobile1 === 0 ? '🔒 PLAFOND STRUCTUREL : excès de ' + exces1 + ' élève(s) 1, tous verrouillés'
        : '▲ MARGE POSSIBLE : ' + excesMobile1 + ' élève(s) ' + critKey + '=1 déplaçable(s) en excès';
    return { rows: rows, verdict5: verdict5, verdict1: verdict1 };
  }

  const com = statsFor('COM');
  const tra = statsFor('TRA');

  // ---- 3. Construire la grille (en mémoire) ----
  const out = [];
  const now = new Date().toLocaleString('fr-FR');
  const HEAD = ['Classe', 'Effectif',
    '5 (têtes)', '· verrouillés', '· permutables', '· libres', 'Cible 5', 'Écart 5',
    '1 (fonds)', '· verrouillés', '· permutables', '· libres', 'Plafond 1', 'Écart 1'];
  const NB_COLS = HEAD.length;
  const pad = function (arr) { while (arr.length < NB_COLS) arr.push(''); return arr; };

  out.push(pad(['🔒 RAPPORT DE BLOCAGE — généré le ' + now]));
  out.push(pad(['Verrouillé = option offerte dans 1 seule classe (FIXE) · Permutable = 2 classes (PERMUT) · Libre = 3+ ou sans option']));
  out.push(pad([]));
  [{ titre: '=== COMPORTEMENT (COM) — critère prioritaire ===', d: com },
   { titre: '=== TRAVAIL (TRA) ===', d: tra }].forEach(function (bloc) {
    out.push(pad([bloc.titre]));
    out.push(HEAD.slice());
    bloc.d.rows.forEach(function (r) {
      out.push([r.cls, r.n,
        r.nb5, r.v5, r.p5, r.l5, r.cible5, (r.ecart5 > 0 ? '+' : '') + r.ecart5,
        r.nb1, r.v1, r.p1, r.l1, r.plafond1, (r.ecart1 > 0 ? '+' : '') + r.ecart1]);
    });
    out.push(pad(['SYNTHÈSE TÊTES : ' + bloc.d.verdict5]));
    out.push(pad(['SYNTHÈSE FONDS : ' + bloc.d.verdict1]));
    out.push(pad([]));
  });

  // ---- 4. Écrire l'onglet _BLOCAGE en bloc ----
  let sheet = ss.getSheetByName('_BLOCAGE');
  if (!sheet) sheet = ss.insertSheet('_BLOCAGE');
  sheet.clearContents();
  sheet.getRange(1, 1, out.length, NB_COLS).setValues(out);
  sheet.getRange(1, 1).setFontWeight('bold');
  // Gras sur les lignes de titres de bloc et d'en-têtes (2 blocs × 2 lignes)
  const boldRows = [];
  out.forEach(function (row, i) {
    const c0 = String(row[0]);
    if (c0.indexOf('===') === 0 || c0 === 'Classe' || c0.indexOf('SYNTHÈSE') === 0) boldRows.push(i + 1);
  });
  boldRows.forEach(function (r) { sheet.getRange(r, 1, 1, NB_COLS).setFontWeight('bold'); });

  logLine('INFO', '🔒 Rapport de blocage écrit dans l\'onglet _BLOCAGE (' + classes.length + ' classes).');
  logLine('INFO', '   COM : ' + com.verdict5 + ' | ' + com.verdict1);
  return { ok: true, com: com, tra: tra };
}
