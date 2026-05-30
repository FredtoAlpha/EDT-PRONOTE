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
    .addItem('Definir le niveau de cette instance', 'dialogueNiveau')
    .addItem('Definir le mot de passe admin', 'dialogueMotDePasse')
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
    niveauVerrouille: String(configGet('NIVEAU_LOCKED', 'false')).toLowerCase() === 'true',
    motDePasseConfigure: motDePasseAdminConfigure(),
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

/** Definit le niveau de l'instance (verrou). */
function apiDefinirNiveau(niveau) {
  return setNiveau(niveau);
}

/** Definit le mot de passe admin. */
function apiDefinirMotDePasse(pwd) {
  return definirMotDePasseAdmin(pwd);
}

// =============================================================================
// Dialogues simples (menu)
// =============================================================================

function dialogueNiveau() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Niveau de cette instance', 'Saisir : 6e, 5e, 4e ou 3e', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var res = setNiveau(r.getResponseText());
  ui.alert(res.message);
}

function dialogueMotDePasse() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Mot de passe admin',
    'Min 10 caracteres, 1 maj, 1 min, 1 chiffre. (vide = generer un mot de passe robuste)',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pwd = r.getResponseText();
  if (!pwd) {
    pwd = genererMotDePasse(14);
    var res = definirMotDePasseAdmin(pwd);
    ui.alert(res.ok ? ('Mot de passe genere (a noter) :\n\n' + pwd) : res.message);
    return;
  }
  var def = definirMotDePasseAdmin(pwd);
  ui.alert(def.ok ? def.message : (def.message + '\n- ' + (def.raisons || []).join('\n- ')));
}
