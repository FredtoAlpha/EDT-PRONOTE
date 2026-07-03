/**
 * ===================================================================
 * 🔄 PRIME LEGACY - CALCULATEUR DE MOBILITÉ
 * ===================================================================
 *
 * Ce module calcule et remplit les colonnes FIXE et MOBILITE
 * pour tous les élèves selon la matrice définie dans
 * LEGACY_Mobilite_Matrice.md
 *
 * Appelé après Phase 1 (placement initial)
 *
 * Date : 2025-11-22
 * ===================================================================
 */

/**
 * Calcule et remplit les colonnes FIXE et MOBILITE dans tous les onglets TEST
 * @param {Object} ctx - Contexte LEGACY
 */
function calculerEtRemplirMobilite_LEGACY(ctx) {
  logLine('INFO', '🔄 Calcul mobilité (FIXE/PERMUT/LIBRE)...');
  
  // 🌟 APPROCHE UNIVERSELLE : Détecter LV2 universelles
  const nbClasses = (ctx.niveaux || []).length;
  const lv2Counts = {};
  
  for (const classe in (ctx.quotas || {})) {
    const quotas = ctx.quotas[classe];
    for (const optName in quotas) {
      if (isKnownLV2(optName) && quotas[optName] > 0) {
        lv2Counts[optName] = (lv2Counts[optName] || 0) + 1;
      }
    }
  }
  
  const lv2Universelles = [];
  for (const lv2 in lv2Counts) {
    if (lv2Counts[lv2] === nbClasses) {
      lv2Universelles.push(lv2);
    }
  }
  
  // Ajouter au contexte
  ctx.lv2Universelles = lv2Universelles;
  
  const ss = ctx.ss || SpreadsheetApp.getActive();
  let stats = {
    FIXE: 0,
    PERMUT: 0,
    LIBRE: 0,
    GROUPE_FIXE: 0,
    GROUPE_PERMUT: 0,
    GROUPE_LIBRE: 0
  };
  
  // Consolider toutes les données pour détecter les groupes ASSO
  const allData = [];
  let headersRef = null;
  
  (ctx.cacheSheets || []).forEach(function(testName) {
    const sheet = ss.getSheetByName(testName);
    if (!sheet || sheet.getLastRow() <= 1) return;
    
    const data = sheet.getDataRange().getValues();
    // Référence d'en-tête : privilégier un onglet qui contient bien FIXE +
    // MOBILITE (les onglets peuvent diverger ; ne pas se fier au 1er venu).
    const hasMob = data[0].indexOf('FIXE') !== -1 && data[0].indexOf('MOBILITE') !== -1;
    if (!headersRef || (hasMob && (headersRef.indexOf('FIXE') === -1 || headersRef.indexOf('MOBILITE') === -1))) {
      headersRef = data[0];
    }

    for (let i = 1; i < data.length; i++) {
      allData.push({
        sheetName: testName,
        rowIndex: i,
        row: data[i]
      });
    }
  });
  
  if (allData.length === 0) {
    logLine('WARN', '  ⚠️ Aucun élève trouvé pour calcul mobilité');
    return stats;
  }
  
  // Identifier les index des colonnes
  const idxFIXE = headersRef.indexOf('FIXE');
  const idxMOBILITE = headersRef.indexOf('MOBILITE');
  const idxASSO = headersRef.indexOf('ASSO');
  
  if (idxFIXE === -1 || idxMOBILITE === -1) {
    logLine('WARN', '  ⚠️ Colonnes MOBILITE ou FIXE manquantes, skip');
    return stats;
  }
  
  // Identifier groupes ASSO
  const groupesASSO = {};
  for (let i = 0; i < allData.length; i++) {
    const codeA = String(allData[i].row[idxASSO] || '').trim().toUpperCase();
    if (codeA) {
      if (!groupesASSO[codeA]) groupesASSO[codeA] = [];
      groupesASSO[codeA].push(i);
    }
  }
  
  logLine('INFO', '  📊 Offres par classe :');
  for (const classe in (ctx.quotas || {})) {
    const q = ctx.quotas[classe];
    const lv2 = Object.keys(q).filter(k => isKnownLV2(k));
    const opt = Object.keys(q).filter(k => isKnownOPT(k));
    logLine('INFO', '    • ' + classe + ' : LV2={' + (lv2.join(', ') || 'aucune') + '}, OPT={' + (opt.join(', ') || 'aucune') + '}');
  }
  
  // Calculer mobilité pour chaque élève (résultat stocké sur l'item, écrit
  // ensuite onglet par onglet selon le schéma RÉEL de chaque onglet).
  for (let i = 0; i < allData.length; i++) {
    const item = allData[i];
    const codeA = String(item.row[idxASSO] || '').trim().toUpperCase();

    let mobilite, fixe;

    if (codeA && groupesASSO[codeA] && groupesASSO[codeA].length > 1) {
      // Élève dans un groupe ASSO
      const result = calculerMobiliteGroupe_LEGACY(codeA, groupesASSO[codeA], allData, headersRef, ctx);
      mobilite = result.mobilite;
      fixe = result.fixe;
    } else {
      // Élève individuel
      const result = calculerMobiliteEleve_LEGACY(item.row, headersRef, allData, ctx);
      mobilite = result.mobilite;
      fixe = result.fixe;
    }

    // Mémoriser sur l'item (pas dans item.row : la position des colonnes
    // FIXE/MOBILITE peut différer d'un onglet à l'autre).
    item.mobilite = mobilite;
    item.fixe = fixe;

    // Stats
    if (stats[mobilite] !== undefined) {
      stats[mobilite]++;
    }
  }

  // Écrire les résultats dans les onglets TEST.
  // ⚠️ Chaque onglet a SON propre en-tête : on ne réutilise PAS headersRef
  // (figé sur le 1er onglet) — sinon un onglet plus étroit/large fait planter
  // setValues ("N colonnes de données ≠ M colonnes de la plage").
  (ctx.cacheSheets || []).forEach(function(testName) {
    const sheet = ss.getSheetByName(testName);
    if (!sheet || sheet.getLastRow() <= 1) return;
    const data = sheet.getDataRange().getValues();
    const sheetHeaders = data[0];

    // Auto-réparation : garantir la présence de FIXE / MOBILITE sur CET onglet.
    let sIdxFIXE = sheetHeaders.indexOf('FIXE');
    let sIdxMOBILITE = sheetHeaders.indexOf('MOBILITE');
    if (sIdxFIXE === -1) { sheetHeaders.push('FIXE'); sIdxFIXE = sheetHeaders.length - 1; }
    if (sIdxMOBILITE === -1) { sheetHeaders.push('MOBILITE'); sIdxMOBILITE = sheetHeaders.length - 1; }
    const width = sheetHeaders.length;

    // Normaliser toutes les lignes à la largeur de l'onglet (évite tout
    // tableau « en dents de scie » refusé par setValues).
    for (let r = 0; r < data.length; r++) {
      while (data[r].length < width) data[r].push('');
    }

    // Réinjecter mobilité/FIXE pour les élèves de cet onglet, aux index DE CET
    // onglet.
    const sheetData = allData.filter(item => item.sheetName === testName);
    for (let i = 0; i < sheetData.length; i++) {
      const item = sheetData[i];
      data[item.rowIndex][sIdxFIXE] = item.fixe;
      data[item.rowIndex][sIdxMOBILITE] = item.mobilite;
    }

    sheet.getRange(1, 1, data.length, width).setValues(data);
  });
  
  logLine('INFO', '✅ Mobilité calculée pour ' + allData.length + ' élèves');
  logLine('INFO', '  📊 Statistiques :');
  logLine('INFO', '    • FIXE : ' + stats.FIXE + ' élèves');
  logLine('INFO', '    • PERMUT : ' + stats.PERMUT + ' élèves');
  logLine('INFO', '    • LIBRE : ' + stats.LIBRE + ' élèves');
  logLine('INFO', '    • GROUPE_FIXE : ' + stats.GROUPE_FIXE + ' groupes');
  logLine('INFO', '    • GROUPE_PERMUT : ' + stats.GROUPE_PERMUT + ' groupes');
  logLine('INFO', '    • GROUPE_LIBRE : ' + stats.GROUPE_LIBRE + ' groupes');
  
  return stats;
}

/**
 * Calcule la mobilité d'un élève individuel
 * @param {Array} row - Ligne de l'élève
 * @param {Array} headers - En-têtes
 * @param {Array} allData - Tous les élèves (pour vérifier DISSO)
 * @param {Object} ctx - Contexte
 * @returns {Object} { mobilite: string, fixe: string }
 */
function calculerMobiliteEleve_LEGACY(row, headers, allData, ctx) {
  const idxLV2 = headers.indexOf('LV2');
  const idxOPT = headers.indexOf('OPT');
  const idxDISSO = headers.indexOf('DISSO');
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  
  const lv2 = String(row[idxLV2] || '').trim().toUpperCase();
  const opt = String(row[idxOPT] || '').trim().toUpperCase();
  const disso = String(row[idxDISSO] || '').trim().toUpperCase();
  
  // 1. Identifier classes compatibles (LV2 + OPT)
  let classesCompatibles = [];
  
  for (const classe in (ctx.quotas || {})) {
    const quotas = ctx.quotas[classe];
    let compatible = true;
    
    // Vérifier LV2 (LV2 universelles toujours compatibles)
    const lv2Universelles = (ctx && ctx.lv2Universelles) || [];
    if (lv2 && lv2Universelles.indexOf(lv2) === -1 && isKnownLV2(lv2)) {
      if (!quotas[lv2] || quotas[lv2] <= 0) {
        compatible = false;
      }
    }

    // Vérifier OPT (indépendamment)
    if (opt && isKnownOPT(opt)) {
      if (!quotas[opt] || quotas[opt] <= 0) {
        compatible = false;
      }
    }
    
    if (compatible) {
      classesCompatibles.push(classe);
    }
  }
  
  // 2. Soustraire classes avec code DISSO
  if (disso) {
    classesCompatibles = classesCompatibles.filter(function(classe) {
      // Vérifier si cette classe contient déjà un élève avec ce code DISSO
      for (let i = 0; i < allData.length; i++) {
        const otherRow = allData[i].row;
        const otherClasse = String(otherRow[idxAssigned] || '').trim();
        const otherDisso = String(otherRow[idxDISSO] || '').trim().toUpperCase();
        
        if (otherClasse === classe && partageCodeDisso_(otherDisso, disso) && otherRow !== row) {  // multi-codes
          return false; // Classe exclue (contient déjà ce code DISSO)
        }
      }
      return true;
    });
  }

  // 2bis. CLASSE(S) IMPOSÉE(S) : restreindre les classes compatibles à
  //       l'ensemble imposé (∩). 1 classe → FIXE ; 2 → PERMUT ; 3+ → LIBRE.
  //       Si l'intersection est vide (imposition incompatible LV2/OPT), on
  //       IGNORE l'imposition (on garde les classes compatibles) — cohérent
  //       avec le pré-placement de Phase 1.
  const idxImposee = headers.indexOf('CLASSE_IMPOSEE');
  if (idxImposee !== -1) {
    const rawImp = String(row[idxImposee] || '').trim();
    if (rawImp) {
      const imposeeSet = rawImp.split('|').map(function (c) { return c.trim(); });
      const inter = classesCompatibles.filter(function (c) { return imposeeSet.indexOf(c) !== -1; });
      if (inter.length > 0) classesCompatibles = inter;
    }
  }

  // 3. Déterminer mobilité selon le nombre
  const nbClasses = classesCompatibles.length;
  
  if (nbClasses === 0) {
    return { mobilite: 'ERREUR', fixe: 'OUI' };
  } else if (nbClasses === 1) {
    return { mobilite: 'FIXE', fixe: 'OUI' };
  } else if (nbClasses === 2) {
    return { mobilite: 'PERMUT', fixe: 'NON' };
  } else {
    return { mobilite: 'LIBRE', fixe: 'NON' };
  }
}

/**
 * Calcule la mobilité d'un groupe ASSO
 * @param {string} codeASSO - Code du groupe (ex: A1)
 * @param {Array} indicesGroupe - Indices des membres dans allData
 * @param {Array} allData - Tous les élèves
 * @param {Array} headers - En-têtes
 * @param {Object} ctx - Contexte
 * @returns {Object} { mobilite: string, fixe: string }
 */
function calculerMobiliteGroupe_LEGACY(codeASSO, indicesGroupe, allData, headers, ctx) {
  // 1. Calculer classes compatibles pour chaque membre
  const classesParMembre = indicesGroupe.map(function(idx) {
    const result = calculerMobiliteEleve_LEGACY(allData[idx].row, headers, allData, ctx);
    
    // Extraire les classes compatibles pour ce membre
    const idxLV2 = headers.indexOf('LV2');
    const idxOPT = headers.indexOf('OPT');
    const idxDISSO = headers.indexOf('DISSO');
    const row = allData[idx].row;
    
    const lv2 = String(row[idxLV2] || '').trim().toUpperCase();
    const opt = String(row[idxOPT] || '').trim().toUpperCase();
    const disso = String(row[idxDISSO] || '').trim().toUpperCase();
    
    let classes = [];
    for (const classe in (ctx.quotas || {})) {
      const quotas = ctx.quotas[classe];
      let compatible = true;
      
      // LV2 universelles toujours compatibles
      const lv2Universelles = (ctx && ctx.lv2Universelles) || [];
      if (lv2 && lv2Universelles.indexOf(lv2) === -1 && isKnownLV2(lv2)) {
        if (!quotas[lv2] || quotas[lv2] <= 0) compatible = false;
      }
      if (opt && isKnownOPT(opt)) {
        if (!quotas[opt] || quotas[opt] <= 0) compatible = false;
      }
      
      if (compatible) classes.push(classe);
    }
    
    return classes;
  });
  
  // 2. Intersection : classes compatibles pour TOUS les membres
  let classesCommunes = classesParMembre[0] || [];
  
  for (let i = 1; i < classesParMembre.length; i++) {
    classesCommunes = classesCommunes.filter(function(c) {
      return classesParMembre[i].indexOf(c) >= 0;
    });
  }
  
  // 3. Soustraire classes avec codes DISSO du groupe
  const idxDISSO = headers.indexOf('DISSO');
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  
  // multi-codes : aplatir tous les codes portés par les membres du groupe
  const codesDISSO = [];
  indicesGroupe.forEach(function(idx) {
    dissoCodesOf_(String(allData[idx].row[idxDISSO] || '')).forEach(function(c) {
      if (codesDISSO.indexOf(c) === -1) codesDISSO.push(c);
    });
  });
  
  for (let c = 0; c < codesDISSO.length; c++) {
    const code = codesDISSO[c];
    classesCommunes = classesCommunes.filter(function(classe) {
      // Vérifier si cette classe contient déjà un élève avec ce code DISSO
      for (let i = 0; i < allData.length; i++) {
        // Ne pas compter les membres du groupe actuel
        if (indicesGroupe.indexOf(i) >= 0) continue;
        
        const otherRow = allData[i].row;
        const otherClasse = String(otherRow[idxAssigned] || '').trim();
        const otherDisso = String(otherRow[idxDISSO] || '').trim().toUpperCase();
        
        if (otherClasse === classe && partageCodeDisso_(otherDisso, code)) {  // multi-codes
          return false; // Classe exclue
        }
      }
      return true;
    });
  }
  
  // 4. Déterminer mobilité du groupe
  const nbClasses = classesCommunes.length;
  
  if (nbClasses === 0) {
    return { mobilite: 'GROUPE_ERREUR', fixe: 'OUI' };
  } else if (nbClasses === 1) {
    return { mobilite: 'GROUPE_FIXE', fixe: 'OUI' };
  } else if (nbClasses === 2) {
    return { mobilite: 'GROUPE_PERMUT', fixe: 'NON' };
  } else {
    return { mobilite: 'GROUPE_LIBRE', fixe: 'NON' };
  }
}
