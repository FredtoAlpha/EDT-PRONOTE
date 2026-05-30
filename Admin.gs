/**
 * ===================================================================
 * Admin.gs — Mot de passe admin (simple, par defaut, modifiable)
 * ===================================================================
 *
 * Un mot de passe par defaut existe et SUFFIT. Rien n'est impose : aucune
 * politique de complexite, aucun blocage. Modifiable librement si besoin.
 * Stocke dans _CONFIG (cle ADMIN_PWD).
 * ===================================================================
 */

/** Mot de passe par defaut (utilise tant qu'aucun autre n'est defini). */
var MOT_DE_PASSE_DEFAUT = 'edt';

/** Mot de passe admin courant (defaut si non personnalise). */
function motDePasseAdmin() {
  return configGet('ADMIN_PWD', MOT_DE_PASSE_DEFAUT);
}

/** Change le mot de passe admin (aucune contrainte de complexite). */
function definirMotDePasseAdmin(pwd) {
  if (pwd === null || pwd === undefined || String(pwd) === '') {
    return { ok: false, message: 'Mot de passe vide.' };
  }
  configSet('ADMIN_PWD', String(pwd));
  return { ok: true, message: 'Mot de passe admin mis a jour.' };
}

/** Verifie un mot de passe propose. */
function verifierMotDePasseAdmin(pwd) {
  return String(pwd) === String(motDePasseAdmin());
}
