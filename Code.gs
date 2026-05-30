/**
 * ===================================================================
 * Code.gs — Points d'entree (menu, web app, API serveur)
 * ===================================================================
 *
 * Couche FINE : se contente de cabler l'UI et les Sheets sur les modules purs
 * (Score / Config / ImportEDT / Repartition / EcritureClasses / Admin).
 * Aucune logique metier ici.
 * ===================================================================
 */

/** Menu a l'ouverture du classeur. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EDT-PRONOTE')
    .addItem('Ouvrir la console', 'ouvrirConsole')
    .addSeparator()
    .addItem('Changer le niveau', 'dialogueNiveau')
    .addToUi();
}

/** Sert l'UI unique en boite de dialogue. */
function ouvrirConsole() {
  var html = HtmlService.createTemplateFromFile('Interface')
    .evaluate().setWidth(900).setHeight(680).setTitle('EDT-PRONOTE');
  SpreadsheetApp.getUi().showModalDialog(html, 'EDT-PRONOTE — Niveau ' + getNiveau());
}

/** Sert l'UI unique en application web (deploiement clasp). */
function doGet() {
  return HtmlService.createTemplateFromFile('Interface')
    .evaluate().setTitle('EDT-PRONOTE');
}

/** Inclusion de partials HTML (CSS/JS). */
function include(nom) {
  return HtmlService.createHtmlOutputFromFile(nom).getContent();
}

// =============================================================================
// API appelee depuis l'UI (google.script.run)
// =============================================================================

/** Contexte d'ouverture pour l'UI. */
function apiContexte() {
  return {
    niveau: getNiveau(),
    niveaux: NIVEAUX_VALIDES,
    libelles: SCORE_LIBELLES
  };
}

/** Apercu (dry-run) d'un import EDT : ne touche pas le classeur. */
function apiApercuImport(csvText) {
  try {
    var res = previewImportEdtCsv(csvText, getNiveau());
    return { ok: true, resume: res.resume, preflight: res.preflight, nbEleves: res.eleves.length };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/**
 * Importe + repartit + ecrit dans le classeur.
 * @param {string} csvText
 * @param {number} nbClasses
 */
function apiImporterEtRepartir(csvText, nbClasses) {
  try {
    var niveau = getNiveau();
    var rows = parseCsvText(csvText);
    var parsed = parseEdt(rows, { niveau: niveau });
    if (!parsed.eleves.length) return { ok: false, message: 'Aucun eleve pour le niveau ' + niveau + '.' };
    var resultat = repartir(parsed.eleves, { nbClasses: nbClasses || 4 });
    var ecrit = ecrireRepartition(resultat.classes, niveau);
    return {
      ok: true,
      resumeImport: resumePreflight(parsed.preflight),
      resumeRepartition: resumeRepartition(resultat),
      onglets: ecrit.onglets,
      conflits: resultat.rapport.conflits
    };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** Change le niveau de l'instance (librement). */
function apiDefinirNiveau(niveau) {
  return setNiveau(niveau);
}

// =============================================================================
// Dialogue simple (menu)
// =============================================================================

function dialogueNiveau() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Changer le niveau', 'Saisir : 6e, 5e, 4e ou 3e (actuel : ' + getNiveau() + ')', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var res = setNiveau(r.getResponseText());
  ui.alert(res.message);
}
