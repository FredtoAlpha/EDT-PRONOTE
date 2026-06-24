/**
 * ===================================================================
 * 📋 PRIME LEGACY - INITIALISATION DES ONGLETS TEST
 * ===================================================================
 *
 * Gestion des onglets TEST pour le pipeline LEGACY :
 * - Création des onglets TEST (vidage doux)
 * - Copie des en-têtes depuis les onglets sources
 * - Formatage des onglets TEST
 *
 * ISOLATION COMPLÈTE :
 * - OPTI : _BASEOPTI → _CACHE
 * - LEGACY : Sources (°1, °2) → TEST
 *
 * Date : 2025-11-13
 * Branche : claude/PRIME-LEGACY-01SJDcJv7zHGGBXWhHpzfnxr
 *
 * ===================================================================
 */

// ===================================================================
// INITIALISATION DES ONGLETS TEST
// ===================================================================

/**
 * Initialise les onglets TEST (vide uniquement les lignes de données, garde les en-têtes)
 * ⚠️ SÉCURITÉ : Ne vide PAS tout, seulement les lignes élèves (>= ligne 2)
 *
 * @param {Object} ctx - Contexte LEGACY
 * @returns {Object} { opened: ["5°1TEST", ...], active: "5°1TEST" }
 */
function initEmptyTestTabs_LEGACY(ctx) {
  logLine('INFO', '📋 Initialisation onglets TEST (vidage doux)...');

  const opened = [];

  (ctx.cacheSheets || []).forEach(function(name) {
    let sh = ctx.ss.getSheetByName(name);

    if (!sh) {
      // ✅ Créer l'onglet TEST s'il n'existe pas
      sh = ctx.ss.insertSheet(name);
      logLine('INFO', '  ✨ ' + name + ' créé');
    }

    // ✅ VIDAGE DOUX : Garde les en-têtes (ligne 1), vide seulement les données.
    if (sh.getLastRow() > 1) {
      // ⚠️ Détection de schéma PÉRIMÉ : si l'en-tête TEST ne contient PAS la
      //    colonne CLASSE_IMPOSEE alors que les onglets sources l'ont désormais,
      //    cet onglet date d'AVANT l'ajout de colonne → il est plus étroit que
      //    les données à écrire, d'où l'erreur « N colonnes de données ≠ M de la
      //    plage » au setValues des phases. On RECONSTRUIT l'en-tête depuis la
      //    source (les données sont de toute façon recalculées par le pipeline).
      const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
        .map(function (h) { return String(h || '').trim().toUpperCase(); });
      // Colonnes ajoutées au fil du temps : si l'une manque, l'en-tête est plus
      // étroit que les données → on reconstruit. (CLASSE_IMPOSEE puis DEFENSE.)
      if (hdr.indexOf('CLASSE_IMPOSEE') === -1 || hdr.indexOf('DEFENSE') === -1) {
        sh.clear();
        writeTestHeaders_LEGACY(ctx, sh, name);
        logLine('INFO', '  🔁 ' + name + ' : en-tête périmé (colonne manquante) → reconstruit depuis la source');
      } else {
        const numRows = sh.getLastRow() - 1; // Nombre de lignes de données
        const numCols = Math.max(1, sh.getLastColumn());
        sh.getRange(2, 1, numRows, numCols).clearContent();
        logLine('INFO', '  🧹 ' + name + ' : ' + numRows + ' lignes vidées (en-tête conservé)');
      }
    } else {
      // Pas d'en-têtes → créer
      writeTestHeaders_LEGACY(ctx, sh, name);
      logLine('INFO', '  ✨ ' + name + ' : en-têtes créés');
    }

    // S'assurer que les en-têtes existent
    if (sh.getLastRow() === 0) {
      writeTestHeaders_LEGACY(ctx, sh, name);
    }

    opened.push(name);
  });

  SpreadsheetApp.flush();

  const active = opened[0] || null;
  logLine('INFO', '✅ Onglets TEST initialisés : ' + opened.join(', '));

  return { opened: opened, active: active };
}

/**
 * Écrit les en-têtes dans un onglet TEST
 * Copie les en-têtes depuis l'onglet source correspondant
 *
 * @param {Object} ctx - Contexte LEGACY
 * @param {Sheet} targetSheet - Onglet TEST cible
 * @param {string} testName - Nom de l'onglet TEST (ex: "5°1TEST")
 */
function writeTestHeaders_LEGACY(ctx, targetSheet, testName) {
  // ✅ Trouver l'onglet source correspondant
  let srcName = null;

  // En mode LEGACY, testName est comme "6°1TEST"
  // On doit trouver l'onglet source correspondant (ex: "PREVERT°1" ou "ECOLE1")
  const destName = testName.replace(ctx.writeTarget, ''); // "6°1"

  // ✅ Utiliser le mapping inverse pour accès direct
  if (ctx.destToSourceMapping) {
    srcName = ctx.destToSourceMapping[destName];
  } else if (ctx.sourceToDestMapping) {
    // Fallback ancien code (si destToSourceMapping n'existe pas)
    for (const source in ctx.sourceToDestMapping) {
      if (ctx.sourceToDestMapping[source] === destName) {
        srcName = source;
        break;
      }
    }
  }

  // Fallback : si pas de mapping, utiliser destName directement
  if (!srcName) {
    srcName = destName;
  }

  const srcSheet = ctx.ss.getSheetByName(srcName);

  if (srcSheet && srcSheet.getLastRow() > 0) {
    // ✅ Copier les en-têtes depuis l'onglet source
    const headers = srcSheet.getRange(1, 1, 1, srcSheet.getLastColumn()).getValues()[0];
    targetSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // ✅ Formater l'en-tête
    targetSheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setFontSize(TEST_FORMATTING_CONFIG.fontSize + 1)
      .setBackground('#C6E0B4'); // Vert clair

    logLine('INFO', '    📋 En-têtes copiés de ' + srcName + ' vers ' + testName);

    // ✅ Ajouter la colonne _CLASS_ASSIGNED si elle n'existe pas
    ensureClassAssignedColumn_LEGACY(targetSheet, headers);

  } else {
    logLine('WARN', '⚠️ Impossible de trouver l\'onglet source pour ' + testName + ' (cherché: ' + srcName + ')');

    // ✅ Créer des en-têtes par défaut
    createDefaultHeaders_LEGACY(targetSheet);
  }
}

/**
 * S'assure que les colonnes FIXE, MOBILITE et _CLASS_ASSIGNED existent
 * Structure alignée avec pipeline OPTI :
 *   P: FIXE
 *   Q: MOBILITE
 *   R: _CLASS_ASSIGNED
 *
 * @param {Sheet} sheet - Onglet TEST
 * @param {Array} headers - En-têtes actuels
 */
function ensureClassAssignedColumn_LEGACY(sheet, headers) {
  const idxFIXE = headers.indexOf('FIXE');
  const idxMOBILITE = headers.indexOf('MOBILITE');
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  
  let currentCol = headers.length + 1;
  
  // ✅ Ajouter FIXE si absente (colonne P)
  if (idxFIXE === -1) {
    sheet.getRange(1, currentCol).setValue('FIXE');
    sheet.getRange(1, currentCol)
      .setFontWeight('bold')
      .setBackground('#FFA500'); // Orange
    logLine('INFO', '    ✅ Colonne FIXE ajoutée (colonne ' + currentCol + ')');
    currentCol++;
  }
  
  // ✅ Ajouter MOBILITE si absente (colonne Q)
  if (idxMOBILITE === -1) {
    sheet.getRange(1, currentCol).setValue('MOBILITE');
    sheet.getRange(1, currentCol)
      .setFontWeight('bold')
      .setBackground('#ADD8E6'); // Bleu clair
    logLine('INFO', '    ✅ Colonne MOBILITE ajoutée (colonne ' + currentCol + ')');
    currentCol++;
  }
  
  // ✅ Ajouter _CLASS_ASSIGNED si absente (colonne R)
  if (idxAssigned === -1) {
    sheet.getRange(1, currentCol).setValue('_CLASS_ASSIGNED');
    sheet.getRange(1, currentCol)
      .setFontWeight('bold')
      .setBackground('#FFD966'); // Jaune
    logLine('INFO', '    ✅ Colonne _CLASS_ASSIGNED ajoutée (colonne ' + currentCol + ')');
  }
}

/**
 * Crée des en-têtes par défaut si aucun onglet source n'est trouvé
 *
 * @param {Sheet} sheet - Onglet TEST
 */
function createDefaultHeaders_LEGACY(sheet) {
  // ✅ En-têtes par défaut pour un onglet TEST
  const defaultHeaders = [
    'ID_ELEVE',
    'NOM',
    'PRENOM',
    'SEXE',
    'LV2',
    'OPT',
    'COM',
    'TRA',
    'PART',
    'ABS',
    'DISPO',       // ✅ FIX: Colonne manquante qui causait le décalage des indices
    'ASSO',
    'DISSO',
    '_CLASS_ASSIGNED',
    'MOBILITE',
    'FIXE'
  ];

  sheet.getRange(1, 1, 1, defaultHeaders.length).setValues([defaultHeaders]);

  // ✅ Formater l'en-tête
  sheet.getRange(1, 1, 1, defaultHeaders.length)
    .setFontWeight('bold')
    .setFontSize(TEST_FORMATTING_CONFIG.fontSize + 1)
    .setBackground('#C6E0B4'); // Vert clair

  // ✅ Mettre _CLASS_ASSIGNED en jaune
  const idxAssigned = defaultHeaders.indexOf('_CLASS_ASSIGNED');
  if (idxAssigned >= 0) {
    sheet.getRange(1, idxAssigned + 1)
      .setBackground('#FFD966'); // Jaune
  }

  logLine('INFO', '    ✨ En-têtes par défaut créés');
}

// ===================================================================
// CONFIGURATION DES COULEURS LV2/OPT
// ===================================================================

const TEST_FORMATTING_CONFIG = {
  fontSize: 11,
  // Couleurs par LV2 (couleurs des pays)
  lv2Colors: {
    'ESP': '#FFB347',     // Orange (Espagne)
    'ITA': '#d5f5e3',     // Vert personnalisé (Italie)
    'ALL': '#FFED4E',     // Jaune (Allemagne)
    'PT': '#32CD32',      // Vert (Portugal)
    'OR': '#FFD700'       // Or (Option OR)
  },
  // Couleurs par OPT (avec meilleur contraste)
  optColors: {
    'CHAV': '#8B4789',    // Violet plus foncé (CHAV) - meilleur contraste
    'LATIN': '#e8f8f5',   // Vert d'eau (LATIN)
    'CHINOIS': '#C41E3A', // Rouge cardinal (CHINOIS)
    'GREC': '#f6ca9d'     // Orange clair (GREC)
  }
};

// ===================================================================
// FORMATAGE DES ONGLETS TEST
// ===================================================================

/**
 * Formate les onglets TEST pour améliorer la lisibilité
 *
 * @param {Object} ctx - Contexte LEGACY
 */
function formatTestSheets_LEGACY(ctx) {
  logLine('INFO', '🎨 Formatage des onglets TEST...');

  (ctx.cacheSheets || []).forEach(function(name) {
    const sh = ctx.ss.getSheetByName(name);
    if (!sh) return;

    try {
      // ✅ CACHER LES COLONNES A, B ET C
      sh.hideColumns(1, 3);
      
      // ✅ Figer la première ligne (en-têtes)
      sh.setFrozenRows(1);

      // ✅ Ajuster la largeur des colonnes
      adjustColumnWidths_LEGACY(sh);

      // ✅ Formater les colonnes spéciales et appliquer couleurs LV2/OPT
      formatSpecialColumns_LEGACY(sh);
      
      // ✅ AUGMENTER TAILLE POLICE ET TOUT EN GRAS
      formatAllTextBold_LEGACY(sh);

      logLine('INFO', '  ✅ ' + name + ' formaté');

    } catch (e) {
      logLine('WARN', '⚠️ Erreur formatage ' + name + ' : ' + e.message);
    }
  });

  SpreadsheetApp.flush();
  logLine('INFO', '✅ Formatage terminé');
}

/**
 * Ajuste la largeur des colonnes pour améliorer la lisibilité
 *
 * @param {Sheet} sheet - Onglet TEST
 */
function adjustColumnWidths_LEGACY(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return;

  const headers = data[0];

  // ✅ Largeurs personnalisées par colonne
  const widths = {
    'ID_ELEVE': 120,
    'NOM': 150,
    'PRENOM': 150,
    'SEXE': 60,
    'LV2': 80,
    'OPT': 80,
    'COM': 60,
    'TRA': 60,
    'PART': 60,
    'ABS': 60,
    'DISPO': 80,         // ✅ FIX: Ajout colonne DISPO
    'ASSO': 80,
    'DISSO': 80,
    '_CLASS_ASSIGNED': 120,
    'MOBILITE': 100,
    'FIXE': 80
  };

  headers.forEach(function(header, idx) {
    const headerName = String(header).trim().toUpperCase();
    const width = widths[headerName] || 100; // Défaut 100px
    sheet.setColumnWidth(idx + 1, width);
  });
}

/**
 * Formate les colonnes spéciales (_CLASS_ASSIGNED, LV2, OPT, etc.)
 * ✅ APPLIQUE COULEURS PAR LV2/OPT SUR TOUTE LA LIGNE
 *
 * @param {Sheet} sheet - Onglet TEST
 */
function formatSpecialColumns_LEGACY(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return;

  const headers = data[0];
  const idxLV2 = headers.indexOf('LV2');
  const idxOPT = headers.indexOf('OPT');
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');

  // ✅ APPLIQUER COULEURS PAR LV2/OPT SUR CHAQUE LIGNE
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;
    
    // Lire LV2 et OPT
    const lv2Value = idxLV2 >= 0 ? String(row[idxLV2] || '').trim().toUpperCase() : '';
    const optValue = idxOPT >= 0 ? String(row[idxOPT] || '').trim().toUpperCase() : '';
    
    let backgroundColor = null;
    
    // Priorité 1 : Couleur par OPT (si présent)
    if (optValue && TEST_FORMATTING_CONFIG.optColors[optValue]) {
      backgroundColor = TEST_FORMATTING_CONFIG.optColors[optValue];
    }
    // Priorité 2 : Couleur par LV2 (si présent et pas d'OPT)
    else if (lv2Value && TEST_FORMATTING_CONFIG.lv2Colors[lv2Value]) {
      backgroundColor = TEST_FORMATTING_CONFIG.lv2Colors[lv2Value];
    }
    
    // Appliquer la couleur sur toute la ligne si trouvée
    if (backgroundColor) {
      sheet.getRange(rowNum, 1, 1, headers.length).setBackground(backgroundColor);
    }
  }

  // ✅ Formater la colonne _CLASS_ASSIGNED (jaune) - uniquement la colonne
  if (idxAssigned >= 0 && sheet.getLastRow() > 1) {
    sheet.getRange(2, idxAssigned + 1, sheet.getLastRow() - 1, 1)
      .setBackground('#FFF2CC'); // Jaune clair
  }

  // ✅ Formater les colonnes scores (COM, TRA, PART, ABS)
  const scoreColumns = ['COM', 'TRA', 'PART', 'ABS'];
  scoreColumns.forEach(function(scoreName) {
    const idx = headers.indexOf(scoreName);
    if (idx >= 0 && sheet.getLastRow() > 1) {
      sheet.getRange(2, idx + 1, sheet.getLastRow() - 1, 1)
        .setHorizontalAlignment('center'); // Centrer
    }
  });
}

/**
 * Formate tout le texte en gras et augmente la taille de la police
 *
 * @param {Sheet} sheet - Onglet TEST
 */
function formatAllTextBold_LEGACY(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow === 0 || lastCol === 0) return;
  
  // ✅ TOUT EN GRAS + TAILLE POLICE
  const allRange = sheet.getRange(1, 1, lastRow, lastCol);
  allRange.setFontWeight('bold');
  allRange.setFontSize(TEST_FORMATTING_CONFIG.fontSize);
  
  // ✅ En-tête plus grand
  sheet.getRange(1, 1, 1, lastCol).setFontSize(TEST_FORMATTING_CONFIG.fontSize + 1);
}

// ===================================================================
// COPIE DES DONNÉES DEPUIS SOURCES VERS TEST
// ===================================================================

/**
 * Copie les données depuis les onglets sources vers les onglets TEST
 * ✅ Copie uniquement les données brutes (sans formules)
 *
 * @param {Object} ctx - Contexte LEGACY
 */
function copySourceDataToTest_LEGACY(ctx) {
  logLine('INFO', '📋 Copie des données sources vers TEST...');

  // ✅ Parcourir chaque onglet source
  (ctx.srcSheets || []).forEach(function(srcName) {
    const srcSheet = ctx.ss.getSheetByName(srcName);
    if (!srcSheet || srcSheet.getLastRow() <= 1) {
      logLine('WARN', '⚠️ ' + srcName + ' vide ou introuvable, skip');
      return;
    }

    // ✅ Trouver l'onglet TEST correspondant
    const destName = (ctx.sourceToDestMapping && ctx.sourceToDestMapping[srcName])
      ? ctx.sourceToDestMapping[srcName] + ctx.writeTarget
      : srcName + ctx.writeTarget;

    const destSheet = ctx.ss.getSheetByName(destName);
    if (!destSheet) {
      logLine('WARN', '⚠️ ' + destName + ' introuvable, skip');
      return;
    }

    // ✅ Copier les données (ligne 2 à la fin)
    const numRows = srcSheet.getLastRow() - 1; // Exclure l'en-tête
    const numCols = srcSheet.getLastColumn();

    if (numRows > 0) {
      const data = srcSheet.getRange(2, 1, numRows, numCols).getValues();

      // ✅ Écrire dans l'onglet TEST
      destSheet.getRange(2, 1, numRows, numCols).setValues(data);

      logLine('INFO', '  ✅ ' + srcName + ' → ' + destName + ' : ' + numRows + ' élèves copiés');
    }
  });

  SpreadsheetApp.flush();
  logLine('INFO', '✅ Copie terminée');
}

// ===================================================================
// UTILITAIRES
// ===================================================================

/**
 * Nettoie les colonnes LV2/OPT dans les onglets TEST
 * ✅ Évite de traîner des LV2/OPT invalides copiées de TEST
 *
 * @param {Object} ctx - Contexte LEGACY
 */
function clearLv2OptColumnsInTest_LEGACY(ctx) {
  logLine('INFO', '🧹 Nettoyage colonnes LV2/OPT dans TEST...');

  (ctx.cacheSheets || []).forEach(function(name) {
    const sh = ctx.ss.getSheetByName(name);
    if (!sh) return;

    const data = sh.getDataRange().getValues();
    if (data.length < 2) return;

    const headers = data[0];
    const idxLV2 = headers.indexOf('LV2');
    const idxOPT = headers.indexOf('OPT');

    let cleared = false;

    if (idxLV2 >= 0) {
      sh.getRange(2, idxLV2 + 1, data.length - 1, 1).clearContent();
      cleared = true;
    }

    if (idxOPT >= 0) {
      sh.getRange(2, idxOPT + 1, data.length - 1, 1).clearContent();
      cleared = true;
    }

    if (cleared) {
      logLine('INFO', '  🧹 ' + name + ' : LV2/OPT nettoyées');
    }
  });

  SpreadsheetApp.flush();
  logLine('INFO', '✅ Nettoyage terminé');
}

/**
 * Active visuellement le premier onglet TEST
 *
 * @param {Object} ctx - Contexte LEGACY
 */
function activateFirstTestTab_LEGACY(ctx) {
  if (!ctx.cacheSheets || ctx.cacheSheets.length === 0) return;

  const firstName = ctx.cacheSheets[0];
  const sh = ctx.ss.getSheetByName(firstName);

  if (sh) {
    ctx.ss.setActiveSheet(sh);
    logLine('INFO', '✅ Onglet actif : ' + firstName);
  }
}
