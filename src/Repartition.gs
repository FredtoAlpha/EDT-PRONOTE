/**
 * ===================================================================
 * Repartition.gs — Moteur de repartition UNIQUE (equilibrage + swaps)
 * ===================================================================
 *
 * Remplace le maquis legacy (Orchestration_V14I + Phases_BASEOPTI_V3 +
 * Phase4_Ultimate + doublons LEGACY/NAUTILUS) par UN seul moteur propre.
 *
 * Concepts conserves : equilibrage multi-criteres (effectif, parite F/G,
 * niveau composite, eleves en difficulte) + amelioration par swaps, avec
 * contraintes :
 *   - VERROU      : eleve non deplacable (contrainte DURE).
 *   - REGROUPE    : eleves a placer ensemble (ASSO, contrainte forte ;
 *                   cassee seulement si impossible, avec signalement).
 *   - SEPARE DE   : eleves a ne pas mettre ensemble (DISSO, contrainte forte ;
 *                   conflits residuels signales).
 *
 * Tout est PUR (aucun SpreadsheetApp) -> testable en Node. Les scores passent
 * par Score.gs (isEnDifficulte, scoreComposite deja calcule par le parser).
 * ===================================================================
 */

// =============================================================================
// Index nominal + appariement des contraintes (pur)
// =============================================================================

function cleNom_(nom, prenom) {
  return (String(nom || '') + ' ' + String(prenom || '')).toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Construit un index "NOM PRENOM" et "PRENOM NOM" -> eleve. */
function indexEleves_(eleves) {
  var idx = {};
  for (var i = 0; i < eleves.length; i++) {
    var e = eleves[i];
    idx[cleNom_(e.nom, e.prenom)] = e;
    idx[cleNom_(e.prenom, e.nom)] = e;
  }
  return idx;
}

/** Decoupe une cellule de contrainte ("DUPOND Alice; MARTIN Bob") en references. */
function refsContrainte_(cell) {
  if (!cell) return [];
  return String(cell).split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
}

// =============================================================================
// Groupes ASSO (union-find) (pur)
// =============================================================================

/**
 * Regroupe les eleves lies par "regroupeAvec" (relation symetrisee).
 * @returns {{groupes:Array<Array>, groupeDe:Object}} groupeDe: cleNom -> id groupe
 */
function construireGroupesAsso(eleves) {
  var parent = {};
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { parent[find(a)] = find(b); }

  for (var i = 0; i < eleves.length; i++) parent[cleNom_(eleves[i].nom, eleves[i].prenom)] = cleNom_(eleves[i].nom, eleves[i].prenom);
  var idx = indexEleves_(eleves);

  for (var j = 0; j < eleves.length; j++) {
    var e = eleves[j];
    var refs = refsContrainte_(e.regroupeAvec);
    for (var k = 0; k < refs.length; k++) {
      var cible = idx[refs[k].toUpperCase().replace(/\s+/g, ' ').trim()];
      if (cible) union(cleNom_(e.nom, e.prenom), cleNom_(cible.nom, cible.prenom));
    }
  }

  var paquets = {};
  for (var m = 0; m < eleves.length; m++) {
    var cle = cleNom_(eleves[m].nom, eleves[m].prenom);
    var racine = find(cle);
    (paquets[racine] = paquets[racine] || []).push(eleves[m]);
  }
  var groupes = [], groupeDe = {};
  Object.keys(paquets).forEach(function (rac, id) {
    groupes.push(paquets[rac]);
    paquets[rac].forEach(function (e) { groupeDe[cleNom_(e.nom, e.prenom)] = id; });
  });
  return { groupes: groupes, groupeDe: groupeDe };
}

// =============================================================================
// Statistiques de classe + cout global (pur)
// =============================================================================

function statsClasse(eleves) {
  var st = { effectif: eleves.length, filles: 0, garcons: 0, sommeComposite: 0, nbComposite: 0, enDifficulte: 0, excellents: 0 };
  for (var i = 0; i < eleves.length; i++) {
    var e = eleves[i];
    if (e.sexe === 'F') st.filles++; else if (e.sexe === 'G') st.garcons++;
    if (typeof e.composite === 'number') { st.sommeComposite += e.composite; st.nbComposite++; }
    if (typeof isEnDifficulte === 'function' ? isEnDifficulte(Math.round(e.composite)) : (e.composite <= 2)) st.enDifficulte++;
    if (typeof isExcellent === 'function' ? isExcellent(Math.round(e.composite)) : (e.composite >= 4)) st.excellents++;
  }
  st.compositeMoy = st.nbComposite ? st.sommeComposite / st.nbComposite : 0;
  st.partFilles = st.effectif ? st.filles / st.effectif : 0;
  return st;
}

function variance_(values) {
  if (!values.length) return 0;
  var moy = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  var v = values.reduce(function (a, b) { return a + (b - moy) * (b - moy); }, 0) / values.length;
  return v;
}

var POIDS_EQUILIBRE_DEFAUT = { effectif: 1.0, parite: 1.0, composite: 1.0, difficulte: 0.8 };

/**
 * Cout global d'un etat (somme ponderee des variances inter-classes).
 * Plus c'est bas, mieux les classes sont equilibrees.
 */
function coutGlobal(classesState, poids) {
  poids = poids || POIDS_EQUILIBRE_DEFAUT;
  var noms = Object.keys(classesState);
  var effs = [], parts = [], comps = [], diffs = [];
  for (var i = 0; i < noms.length; i++) {
    var s = statsClasse(classesState[noms[i]]);
    effs.push(s.effectif); parts.push(s.partFilles); comps.push(s.compositeMoy); diffs.push(s.enDifficulte);
  }
  return poids.effectif * variance_(effs)
    + poids.parite * variance_(parts) * 100   // parts dans [0,1] -> remise a l'echelle
    + poids.composite * variance_(comps)
    + poids.difficulte * variance_(diffs);
}

// =============================================================================
// Contraintes DISSO (pur)
// =============================================================================

/** Construit, pour chaque eleve, l'ensemble des cleNom dont il doit etre separe. */
function construireDisso_(eleves) {
  var idx = indexEleves_(eleves);
  var disso = {}; // cleNom -> Set-like {cleNom:true}
  function add(a, b) { (disso[a] = disso[a] || {})[b] = true; }
  for (var i = 0; i < eleves.length; i++) {
    var e = eleves[i], ce = cleNom_(e.nom, e.prenom);
    refsContrainte_(e.separeDe).forEach(function (ref) {
      var cible = idx[ref.toUpperCase().replace(/\s+/g, ' ').trim()];
      if (cible) { var cc = cleNom_(cible.nom, cible.prenom); add(ce, cc); add(cc, ce); }
    });
  }
  return disso;
}

/** Y a-t-il un conflit DISSO si on place `groupe` dans `classeEleves` ? */
function violeDisso_(groupe, classeEleves, disso) {
  for (var i = 0; i < groupe.length; i++) {
    var ce = cleNom_(groupe[i].nom, groupe[i].prenom);
    if (!disso[ce]) continue;
    for (var j = 0; j < classeEleves.length; j++) {
      if (disso[ce][cleNom_(classeEleves[j].nom, classeEleves[j].prenom)]) return true;
    }
  }
  return false;
}

// =============================================================================
// Moteur principal (pur)
// =============================================================================

/**
 * Normalise la structure cible en liste de classes { nom, capacite }.
 * Accepte : { classes:[{nom,capacite}] } OU { nbClasses, capacite? } OU un nombre.
 */
function normaliserStructure_(structure, nbEleves) {
  if (typeof structure === 'number') structure = { nbClasses: structure };
  structure = structure || {};
  if (structure.classes && structure.classes.length) {
    return structure.classes.map(function (c, i) {
      return { nom: c.nom || ('C' + (i + 1)), capacite: c.capacite || Infinity, options: c.options || null };
    });
  }
  var n = structure.nbClasses || 1;
  var cap = structure.capacite || Math.ceil(nbEleves / n) + 1;
  var classes = [];
  for (var i = 0; i < n; i++) classes.push({ nom: 'C' + (i + 1), capacite: cap, options: null });
  return classes;
}

/**
 * Repartit les eleves dans les classes cibles.
 * @param {Array} eleves
 * @param {Object|number} structure  cf normaliserStructure_
 * @param {Object} [options] { poids, maxSwaps }
 * @returns {{classes:Object, rapport:Object}}
 */
function repartir(eleves, structure, options) {
  options = options || {};
  var poids = options.poids || POIDS_EQUILIBRE_DEFAUT;
  var maxSwaps = options.maxSwaps || 2000;
  eleves = (eleves || []).slice();

  var classesDef = normaliserStructure_(structure, eleves.length);
  var classesState = {};
  classesDef.forEach(function (c) { classesState[c.nom] = []; });
  var capacite = {};
  classesDef.forEach(function (c) { capacite[c.nom] = c.capacite; });
  var noms = classesDef.map(function (c) { return c.nom; });

  var disso = construireDisso_(eleves);
  var asso = construireGroupesAsso(eleves);

  var rapport = { conflits: { assoCasse: [], dissoNonResolu: [] }, swaps: 0, coutInitial: 0, coutFinal: 0, warnings: [] };

  // --- helper : meilleure classe pour un paquet (cout incremental + capacite + DISSO) ---
  function meilleureClasse(paquet, autoriserDisso) {
    var best = null, bestCout = Infinity, bestViole = true;
    for (var i = 0; i < noms.length; i++) {
      var nom = noms[i];
      if (classesState[nom].length + paquet.length > capacite[nom]) continue;
      var viole = violeDisso_(paquet, classesState[nom], disso);
      if (viole && !autoriserDisso) continue;
      // cout incremental simule
      classesState[nom] = classesState[nom].concat(paquet);
      var cout = coutGlobal(classesState, poids);
      classesState[nom] = classesState[nom].slice(0, classesState[nom].length - paquet.length);
      // preferer une classe sans violation DISSO, puis cout le plus bas
      if ((viole === bestViole && cout < bestCout) || (!viole && bestViole)) {
        best = nom; bestCout = cout; bestViole = viole;
      }
    }
    return { nom: best, viole: bestViole };
  }

  function placer(paquet, nom) {
    paquet.forEach(function (e) { e.classe = nom; });
    classesState[nom] = classesState[nom].concat(paquet);
  }

  // --- 1. Eleves verrouilles (place dans leur classe d'origine si valide) ---
  var restants = [];
  eleves.forEach(function (e) {
    if (e.verrou && e.classe && classesState[e.classe] !== undefined) {
      classesState[e.classe].push(e);
    } else {
      restants.push(e);
    }
  });

  // --- 2. Groupes ASSO (>1), des plus grands aux plus petits ---
  var verrouilles = {};
  eleves.forEach(function (e) { if (e.verrou && e.classe) verrouilles[cleNom_(e.nom, e.prenom)] = true; });

  var groupesAPlacer = asso.groupes
    .filter(function (g) { return g.length > 1; })
    .map(function (g) { return g.filter(function (e) { return restants.indexOf(e) >= 0; }); })
    .filter(function (g) { return g.length > 0; })
    .sort(function (a, b) { return b.length - a.length; });

  groupesAPlacer.forEach(function (groupe) {
    var choix = meilleureClasse(groupe, false);
    if (!choix.nom) {
      // impossible sans casser DISSO ou capacite -> on autorise et on signale
      choix = meilleureClasse(groupe, true);
      rapport.conflits.assoCasse.push({ membres: groupe.map(function (e) { return cleNom_(e.nom, e.prenom); }), raison: 'capacite/DISSO' });
    }
    if (choix.viole) {
      rapport.conflits.dissoNonResolu.push({ classe: choix.nom, membres: groupe.map(function (e) { return cleNom_(e.nom, e.prenom); }) });
    }
    placer(groupe, choix.nom || noms[0]);
    groupe.forEach(function (e) { var i = restants.indexOf(e); if (i >= 0) restants.splice(i, 1); });
  });

  // --- 3. Singletons restants : par composite decroissant (repartition en serpentin via cout) ---
  restants.sort(function (a, b) { return (b.composite || 0) - (a.composite || 0); });
  restants.forEach(function (e) {
    var choix = meilleureClasse([e], false);
    if (!choix.nom) choix = meilleureClasse([e], true);
    if (choix.viole) rapport.conflits.dissoNonResolu.push({ classe: choix.nom, membres: [cleNom_(e.nom, e.prenom)] });
    placer([e], choix.nom || noms[0]);
  });

  rapport.coutInitial = coutGlobal(classesState, poids);

  // --- 4. Amelioration par swaps ---
  // On ne deplace ni les eleves verrouilles, ni les membres d'un groupe ASSO (>1)
  // afin de ne jamais casser une contrainte deja satisfaite.
  function deplacable(e) {
    var c = cleNom_(e.nom, e.prenom);
    if (verrouilles[c]) return false;
    var gid = asso.groupeDe[c];
    if (gid !== undefined && asso.groupes[gid].length > 1) return false;
    return true;
  }

  var coutCourant = rapport.coutInitial;
  rapport.moves = 0;
  var ameliore = true, tours = 0;
  while (ameliore && (rapport.swaps + rapport.moves) < maxSwaps && tours < 50) {
    ameliore = false; tours++;

    // 4a. MOVES : deplacer un eleve d'une classe a une autre (corrige les effectifs).
    for (var ma = 0; ma < noms.length; ma++) {
      for (var mb = 0; mb < noms.length; mb++) {
        if (ma === mb) continue;
        var SA = classesState[noms[ma]], SB = classesState[noms[mb]];
        for (var mi = SA.length - 1; mi >= 0; mi--) {
          var em = SA[mi];
          if (!deplacable(em)) continue;
          if (SB.length + 1 > capacite[noms[mb]]) continue;
          if (violeDisso_([em], SB, disso)) continue;
          SA.splice(mi, 1); SB.push(em);          // simuler le move
          var coutM = coutGlobal(classesState, poids);
          if (coutM < coutCourant - 1e-9) {
            em.classe = noms[mb]; coutCourant = coutM; rapport.moves++; ameliore = true;
          } else {
            SB.pop(); SA.splice(mi, 0, em);        // annuler
          }
        }
      }
    }

    // 4b. SWAPS : echanger deux eleves (rafine parite/niveau a effectifs constants).
    for (var a = 0; a < noms.length; a++) {
      for (var b = a + 1; b < noms.length; b++) {
        var CA = classesState[noms[a]], CB = classesState[noms[b]];
        for (var i = 0; i < CA.length; i++) {
          for (var j = 0; j < CB.length; j++) {
            var ea = CA[i], eb = CB[j];
            if (!deplacable(ea) || !deplacable(eb)) continue;
            CA[i] = eb; CB[j] = ea;                 // simuler le swap
            var ok = !violeDisso_([eb], CA, disso) && !violeDisso_([ea], CB, disso);
            var cout = ok ? coutGlobal(classesState, poids) : Infinity;
            if (cout < coutCourant - 1e-9) {
              ea.classe = noms[b]; eb.classe = noms[a];
              coutCourant = cout; rapport.swaps++; ameliore = true;
            } else {
              CA[i] = ea; CB[j] = eb;               // annuler
            }
          }
        }
      }
    }
  }

  rapport.coutFinal = coutGlobal(classesState, poids);
  rapport.repartitionParClasse = {};
  noms.forEach(function (n) { rapport.repartitionParClasse[n] = statsClasse(classesState[n]); });
  return { classes: classesState, rapport: rapport };
}

/** Resume lisible d'un rapport de repartition. Pur. */
function resumeRepartition(resultat) {
  var r = resultat.rapport, L = [];
  L.push('Cout : ' + r.coutInitial.toFixed(2) + ' -> ' + r.coutFinal.toFixed(2) +
    ' (' + (r.moves || 0) + ' moves, ' + r.swaps + ' swaps).');
  Object.keys(resultat.classes).forEach(function (nom) {
    var s = r.repartitionParClasse[nom];
    L.push('  ' + nom + ' : ' + s.effectif + ' el. (' + s.filles + 'F/' + s.garcons + 'G), moy ' +
      s.compositeMoy.toFixed(2) + ', ' + s.enDifficulte + ' en difficulte.');
  });
  if (r.conflits.assoCasse.length) L.push('ASSO cassees : ' + r.conflits.assoCasse.length);
  if (r.conflits.dissoNonResolu.length) L.push('DISSO non resolues : ' + r.conflits.dissoNonResolu.length);
  return L.join('\n');
}

// Export Node pour les tests.
if (typeof module !== 'undefined' && module.exports) {
  try {
    var _s = require('./Score.gs');
    if (typeof isEnDifficulte === 'undefined') { isEnDifficulte = _s.isEnDifficulte; }
    if (typeof isExcellent === 'undefined') { isExcellent = _s.isExcellent; }
  } catch (e) { /* GAS : globales presentes */ }
  module.exports = {
    construireGroupesAsso: construireGroupesAsso,
    statsClasse: statsClasse,
    coutGlobal: coutGlobal,
    repartir: repartir,
    resumeRepartition: resumeRepartition
  };
}
