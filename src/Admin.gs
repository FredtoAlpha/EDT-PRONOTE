/**
 * ===================================================================
 * Admin.gs — Securite admin (mot de passe robuste, par instance)
 * ===================================================================
 *
 * Garde-fou : on ne remet JAMAIS admin123 / 1234. Donnees RGPD eleves.
 * Le mot de passe n'est jamais stocke en clair : on conserve sel + hash
 * (SHA-256) dans _CONFIG (cle ADMIN_PWD_SALT / ADMIN_PWD_HASH).
 *
 * Les fonctions de POLITIQUE et de HACHAGE sont pures (hasher injectable)
 * -> testables hors Apps Script. La persistance _CONFIG vit dans les wrappers.
 * ===================================================================
 */

/** Mots de passe interdits (anciens defauts + classiques). */
var MOTS_DE_PASSE_INTERDITS = [
  'admin123', '1234', '12345', '123456', 'password', 'motdepasse', 'admin', '0000', 'azerty', 'qwerty'
];

/**
 * Valide la force d'un mot de passe. PUR.
 * Regles : >= 10 caracteres, au moins 1 minuscule, 1 majuscule, 1 chiffre,
 * et pas dans la liste interdite.
 * @param {string} pwd
 * @returns {{ok:boolean, raisons:string[]}}
 */
function validerForceMotDePasse(pwd) {
  var raisons = [];
  var s = String(pwd || '');
  if (s.length < 10) raisons.push('Au moins 10 caracteres.');
  if (!/[a-z]/.test(s)) raisons.push('Au moins une minuscule.');
  if (!/[A-Z]/.test(s)) raisons.push('Au moins une majuscule.');
  if (!/[0-9]/.test(s)) raisons.push('Au moins un chiffre.');
  if (MOTS_DE_PASSE_INTERDITS.indexOf(s.toLowerCase()) !== -1) raisons.push('Mot de passe trop courant / interdit.');
  return { ok: raisons.length === 0, raisons: raisons };
}

/**
 * Genere un mot de passe robuste. PUR (rng injectable pour les tests).
 * @param {number} [longueur=14]
 * @param {function():number} [rng=Math.random]
 * @returns {string}
 */
function genererMotDePasse(longueur, rng) {
  longueur = longueur || 14;
  rng = rng || Math.random;
  var min = 'abcdefghijkmnpqrstuvwxyz', maj = 'ABCDEFGHJKLMNPQRSTUVWXYZ', chif = '23456789', spe = '!@#$%-_';
  var tout = min + maj + chif + spe;
  function pick(set) { return set[Math.floor(rng() * set.length)]; }
  // garantir au moins 1 de chaque categorie requise
  var out = [pick(min), pick(maj), pick(chif)];
  for (var i = out.length; i < longueur; i++) out.push(pick(tout));
  // melange (Fisher-Yates)
  for (var j = out.length - 1; j > 0; j--) {
    var k = Math.floor(rng() * (j + 1));
    var tmp = out[j]; out[j] = out[k]; out[k] = tmp;
  }
  return out.join('');
}

/**
 * Hash sel + mot de passe. PUR (hasher injectable).
 * @param {string} pwd
 * @param {string} salt
 * @param {function(string):string} hasher  (ex: SHA-256 hex)
 * @returns {string}
 */
function hacherMotDePasse_(pwd, salt, hasher) {
  return hasher(String(salt) + '::' + String(pwd));
}

// =============================================================================
// Hasher Apps Script (SHA-256 hex via Utilities)
// =============================================================================

function sha256Hex_(texte) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texte, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

// =============================================================================
// API Apps Script (persistance _CONFIG)
// =============================================================================

/**
 * Definit le mot de passe admin (apres validation de force). Stocke sel + hash.
 * @param {string} pwd
 * @returns {{ok:boolean, message:string, raisons?:string[]}}
 */
function definirMotDePasseAdmin(pwd) {
  var v = validerForceMotDePasse(pwd);
  if (!v.ok) return { ok: false, message: 'Mot de passe refuse.', raisons: v.raisons };
  var salt = Utilities.getUuid();
  var hash = hacherMotDePasse_(pwd, salt, sha256Hex_);
  configSet('ADMIN_PWD_SALT', salt);
  configSet('ADMIN_PWD_HASH', hash);
  return { ok: true, message: 'Mot de passe admin defini.' };
}

/**
 * Verifie un mot de passe admin propose.
 * @param {string} pwd
 * @returns {boolean}
 */
function verifierMotDePasseAdmin(pwd) {
  var salt = configGet('ADMIN_PWD_SALT', null);
  var hash = configGet('ADMIN_PWD_HASH', null);
  if (!salt || !hash) return false; // aucun mot de passe defini -> acces refuse (pas de defaut faible)
  return hacherMotDePasse_(pwd, salt, sha256Hex_) === hash;
}

/** Un mot de passe admin est-il configure pour cette instance ? */
function motDePasseAdminConfigure() {
  return !!configGet('ADMIN_PWD_HASH', null);
}

// Export Node pour les tests (logique pure).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MOTS_DE_PASSE_INTERDITS: MOTS_DE_PASSE_INTERDITS,
    validerForceMotDePasse: validerForceMotDePasse,
    genererMotDePasse: genererMotDePasse,
    hacherMotDePasse_: hacherMotDePasse_
  };
}
