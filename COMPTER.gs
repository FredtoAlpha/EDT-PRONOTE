/**
 * Fonction principale pour compter les effectifs des options et langues dans les onglets sources
 * Accessible depuis le menu Répartition > COMPTER
 */
function compterEffectifsOptionsEtLangues() {
  compterEffectifs(false); // false = onglets sources, pas les TEST
}

/**
 * Fonction principale pour compter les effectifs des options et langues dans les onglets TEST
 * Accessible depuis le menu Répartition > COMPTER TEST
 */
function compterEffectifsOptionsEtLanguesTest() {
  compterEffectifs(true); // true = onglets TEST
}

/**
 * Fonction commune qui fait le comptage selon le type d'onglets
 * @param {boolean} isTest - Si true, compte dans les onglets TEST, sinon dans les sources
 */
function compterEffectifs(isTest) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Trouver les onglets appropriés (source ou TEST)
    const onglets = isTest ? trouverOngletsTest() : trouverOngletsSources();
    
    if (onglets.length === 0) {
      const message = isTest 
        ? "Aucun onglet TEST trouvé (format: 5°1TEST, etc.)"
        : "Aucun onglet source trouvé (format: 6°1, 5°2, etc.)";
      SpreadsheetApp.getUi().alert(message);
      return;
    }
    
    // Collecter les statistiques
    const statistiques = collecterStatistiques(onglets);
    
    // Afficher les résultats
    const nomOngletResultat = isTest ? "STATISTIQUES_TEST" : "STATISTIQUES";
    afficherResultats(statistiques, nomOngletResultat, isTest);
    
    // Message de confirmation
    const successMessage = `Analyse terminée pour ${onglets.length} ${isTest ? "onglets TEST" : "classes sources"}.\n` +
      `Les résultats sont affichés dans l'onglet "${nomOngletResultat}".`;
    SpreadsheetApp.getUi().alert(successMessage);

    // Retourner message pour interface
    return successMessage;

  } catch (e) {
    const errorMessage = "Erreur lors du comptage : " + e.message;
    SpreadsheetApp.getUi().alert(errorMessage);
    throw new Error(errorMessage);
    Logger.log("ERREUR: " + e.message);
    Logger.log(e.stack);
  }
}

/**
 * Trouve les onglets sources
 * Formats supportés: 6°1, 6°2, BRESSOLS°4, GAMARRA°7, etc.
 * Pattern universel: QUELQUECHOSE°CHIFFRE (adaptatif à n'importe quel niveau)
 */
function trouverOngletsSources() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  // PATTERN SOURCE: Doit avoir ° suivi de chiffres
  // Accepte: 6°1, 6°2, 6°3 (niveau 5e), BRESSOLS°1, GAMARRA°2 (niveau CM2)
  // Rejette: 6°A, 6°B (destinations), TEST, FIN, DEF, CACHE (résultats)
  const sourcePattern = /^[A-Za-z0-9_-]+°\d+$/;
  const excludePattern = /(TEST|DEF|FIN|CACHE|^_|ACCUEIL|CONSOLIDATION)/i;

  return sheets.filter(sheet => {
    const name = sheet.getName();
    return sourcePattern.test(name) && !excludePattern.test(name);
  });
}

/**
 * Trouve les onglets TEST
 * Formats supportés: 6°1TEST, 6°2TEST, BRESSOLS°4TEST, etc.
 * Logique: SOURCE + suffixe TEST
 */
function trouverOngletsTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  // Pattern: Source (QUELQUECHOSE°CHIFFRE) + TEST
  // Accepte: 6°1TEST, 6°2TEST, BRESSOLS°4TEST, GAMARRA°7TEST
  const testPattern = /^[A-Za-z0-9_-]+°\d+TEST$/;

  return sheets.filter(sheet => {
    const name = sheet.getName();
    return testPattern.test(name);
  });
}

/**
 * Collecte les statistiques COMPLÈTES avec toutes les informations
 */
function collecterStatistiques(onglets) {
  const statistiques = [];
  const topEleves = [];
  
  Logger.log("--- Début collecte statistiques COMPLÈTES ---");

  onglets.forEach(sheet => {
    const nomComplet = sheet.getName();
    Logger.log(`Traitement onglet: ${nomComplet}`);
    const nomClasse = nomComplet.replace("TEST", "");
    const dataRange = sheet.getDataRange();
    const data = dataRange.getValues();

    if (data.length <= 1) {
      Logger.log(`   Onglet ${nomComplet} vide. Effectif = 0.`);
      statistiques.push({
        classe: nomClasse, nomComplet: nomComplet, effectifTotal: 0,
        options: {}, langues: {}, autresLangues: 0,
        codesD: {}, codesA: {}, totalCodesD: 0, totalCodesA: 0,
        elevesCOM1: [], elevesCOM2: [], elevesCOM3: [], elevesCOM4: [],
        elevesTRA4: [], elevesPART4: [], elevesABS4: [],
        elevesExcellents: [] // Élèves avec tous les scores 4
      });
      return;
    }

    // Trouver les indices des colonnes
    const headers = data[0].map(h => String(h).trim());
    
    let idColIndex = headers.indexOf("ID_ELEVE");
    if (idColIndex === -1) idColIndex = headers.indexOf("ID");
    
    const colNomPrenom = headers.indexOf("NOM & PRENOM") !== -1 ? headers.indexOf("NOM & PRENOM") : headers.indexOf("NOM_PRENOM");
    const colLV2 = headers.indexOf("LV2");
    const colOPT = headers.indexOf("OPT");
    
    const colCodesA = headers.indexOf("ASSO") !== -1 ? headers.indexOf("ASSO") : 12;
    const colCodesD = headers.indexOf("DISSO") !== -1 ? headers.indexOf("DISSO") : 13;
    const colCOM = headers.indexOf("COM") !== -1 ? headers.indexOf("COM") : 7;
    const colTRA = headers.indexOf("TRA") !== -1 ? headers.indexOf("TRA") : 8;
    const colPART = headers.indexOf("PART") !== -1 ? headers.indexOf("PART") : 9;
    const colABS = headers.indexOf("ABS") !== -1 ? headers.indexOf("ABS") : 10;

    if (idColIndex === -1) {
      Logger.log(`   ❌ Colonne ID manquante dans ${nomComplet}`);
      return;
    }

    // Initialiser les statistiques COMPLÈTES
    let effectifValide = 0;
    const statsClasse = {
      classe: nomClasse,
      nomComplet: nomComplet,
      effectifTotal: 0,
      
      // Existant
      options: {},
      langues: {},
      autresLangues: 0,
      
      // Codes
      codesD: {},
      codesA: {},
      totalCodesD: 0,
      totalCodesA: 0,
      
      // TOUTES LES CATÉGORIES D'ÉLÈVES
      elevesCOM1: [],  // Difficultés
      elevesCOM2: [],  // Moyens-
      elevesCOM3: [],  // Moyens+
      elevesCOM4: [],  // Excellents
      elevesTRA4: [],  // Très bon travail
      elevesPART4: [], // Très participatifs
      elevesABS4: [],  // Très assidus
      elevesExcellents: [] // Tous scores à 4
    };

    // Parcourir les élèves
    for (let i = 1; i < data.length; i++) {
      const eleveRow = data[i];
      const idValue = String(eleveRow[idColIndex] || "").trim();

      if (!idValue) continue;

      effectifValide++;
      const nomPrenom = colNomPrenom !== -1 ? String(eleveRow[colNomPrenom] || "").trim() : `Élève_${idValue}`;

      // Langues/Options (inchangé)
      if (colLV2 !== -1) {
        const langue = String(eleveRow[colLV2] || "").trim().toUpperCase();
        if (langue) {
          statsClasse.langues[langue] = (statsClasse.langues[langue] || 0) + 1;
          if (langue !== "ESP") {
            statsClasse.autresLangues++;
          }
        }
      }

      if (colOPT !== -1) {
        const optionsStr = String(eleveRow[colOPT] || "").trim().toUpperCase();
        if (optionsStr) {
          const options = optionsStr.split(/[\s,]+/).filter(o => o);
          options.forEach(option => {
            statsClasse.options[option] = (statsClasse.options[option] || 0) + 1;
          });
        }
      }

      // Codes (inchangé)
      const codeA = String(eleveRow[colCodesA] || "").trim().toUpperCase();
      const codeD = String(eleveRow[colCodesD] || "").trim().toUpperCase();
      
      if (codeA && /^A\d+$/.test(codeA)) {
        statsClasse.codesA[codeA] = (statsClasse.codesA[codeA] || 0) + 1;
        statsClasse.totalCodesA++;
      }
      
      if (codeD && /^D\d+$/.test(codeD)) {
        statsClasse.codesD[codeD] = (statsClasse.codesD[codeD] || 0) + 1;
        statsClasse.totalCodesD++;
      }

      // TOUS LES SCORES
      const scoreCOM = parseInt(eleveRow[colCOM]) || 0;
      const scoreTRA = parseInt(eleveRow[colTRA]) || 0;
      const scorePART = parseInt(eleveRow[colPART]) || 0;
      const scoreABS = parseInt(eleveRow[colABS]) || 0;

      // Catégories COM complètes — échelle 5 niveaux : la bande haute (>= 4)
      // regroupe 4 ET 5, sinon les élèves notés 5 disparaissent du tableau.
      if (scoreCOM === 1) statsClasse.elevesCOM1.push(nomPrenom);
      if (scoreCOM === 2) statsClasse.elevesCOM2.push(nomPrenom);
      if (scoreCOM === 3) statsClasse.elevesCOM3.push(nomPrenom);
      if (scoreCOM >= 4) statsClasse.elevesCOM4.push(nomPrenom);

      // Bande haute (4-5) par matière
      if (scoreTRA >= 4) statsClasse.elevesTRA4.push(nomPrenom);
      if (scorePART >= 4) statsClasse.elevesPART4.push(nomPrenom);
      if (scoreABS >= 4) statsClasse.elevesABS4.push(nomPrenom);

      // Élèves excellents (tous scores en bande haute 4-5)
      if (scoreCOM >= 4 && scoreTRA >= 4 && scorePART >= 4 && scoreABS >= 4) {
        statsClasse.elevesExcellents.push(nomPrenom);
      }

      // Moyenne pour TOP
      const scores = [scoreCOM, scoreTRA, scorePART, scoreABS].filter(s => s > 0);
      if (scores.length > 0) {
        const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length;
        topEleves.push({
          nom: nomPrenom,
          classe: nomClasse,
          moyenne: moyenne,
          scores: { COM: scoreCOM, TRA: scoreTRA, PART: scorePART, ABS: scoreABS }
        });
      }
    }

    statsClasse.effectifTotal = effectifValide;
    statistiques.push(statsClasse);
    
    Logger.log(`   ✅ ${nomComplet}: ${effectifValide} élèves`);
  });

  // TOP 24
  topEleves.sort((a, b) => b.moyenne - a.moyenne);
  const top24Meilleurs = topEleves.slice(0, 24);
  const top24Pires = topEleves.slice(-24).reverse();

  statistiques.top24Meilleurs = top24Meilleurs;
  statistiques.top24Pires = top24Pires;

  Logger.log("--- Fin collecte statistiques COMPLÈTES ---");
  return statistiques;
}

/**
 * Affiche les résultats avec une BELLE mise en page organisée
 */
function afficherResultats(statistiques, nomOnglet, isTest) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet = ss.getSheetByName(nomOnglet);
  if (!sheet) {
    sheet = ss.insertSheet(nomOnglet);
  } else {
    sheet.clear();
  }
  
  // === TITRE PRINCIPAL ===
  const titre = isTest ? "📊 ANALYSE COMPLÈTE DES CLASSES (TEST)" : "📊CLASSES SOURCES";
  sheet.getRange("A1").setValue(titre);
  sheet.getRange("A1")
    .setFontWeight("bold")
    .setFontSize(16)
    .setBackground("#1a237e")  // Bleu indigo foncé
    .setFontColor("#ffffff");

  let currentRow = 3;

  // === SECTION 1: EFFECTIFS ET LANGUES ===
  sheet.getRange(currentRow, 1).setValue("📋 EFFECTIFS & LANGUES");
  sheet.getRange(currentRow, 1, 1, 6)
    .setFontWeight("bold")
    .setBackground("#3f51b5")  // Bleu indigo
    .setFontColor("#ffffff");
  currentRow++;

  // En-têtes section 1
  const headers1 = ["Classe", "Effectif Total", "Langues ≠ ESP", "Détail Langues", "% Autres LV2", "Répartition"];
  headers1.forEach((header, index) => {
    sheet.getRange(currentRow, index + 1).setValue(header)
      .setFontWeight("bold")
      .setBackground("#9c27b0")  // Violet
      .setFontColor("#ffffff");
  });
  currentRow++;

  // Données section 1
  statistiques.forEach((stats, index) => {
    if (stats.top24Meilleurs || stats.top24Pires) return;
    
    const languesDetail = Object.entries(stats.langues)
      .filter(([l]) => l.toUpperCase() !== "ESP")
      .map(([langue, count]) => `${langue}=${count}`)
      .join(", ");
    
    const pourcentageAutres = stats.effectifTotal > 0 ? ((stats.autresLangues / stats.effectifTotal) * 100).toFixed(1) : 0;
    const repartition = `ESP:${stats.effectifTotal - stats.autresLangues} / Autres:${stats.autresLangues}`;

    const rowData1 = [
      stats.classe,
      stats.effectifTotal,
      stats.autresLangues,
      languesDetail || "Aucune",
      pourcentageAutres + "%",
      repartition
    ];

    rowData1.forEach((value, colIndex) => {
      const cell = sheet.getRange(currentRow, colIndex + 1);
      cell.setValue(value);
      
      if (index % 2 === 0) {
        cell.setBackground("#e8eaf6");  // Bleu très pâle
      }
    });
    currentRow++;
  });

  currentRow += 2;

  // === SECTION 2: OPTIONS ===
  sheet.getRange(currentRow, 1).setValue("🎯 OPTIONS & SPÉCIALITÉS");
  sheet.getRange(currentRow, 1, 1, 4)
    .setFontWeight("bold")
    .setBackground("#ff6f00")  // Orange foncé
    .setFontColor("#ffffff");
  currentRow++;

  // En-têtes section 2
  const headers2 = ["Classe", "Total Options", "Détail Options", "Répartition %"];
  headers2.forEach((header, index) => {
    sheet.getRange(currentRow, index + 1).setValue(header)
      .setFontWeight("bold")
      .setBackground("#ffb74d")  // Orange clair
      .setFontColor("#e65100");  // Orange foncé
  });
  currentRow++;

  // Données section 2
  statistiques.forEach((stats, index) => {
    if (stats.top24Meilleurs || stats.top24Pires) return;
    
    const optionsDetail = Object.entries(stats.options)
      .map(([option, count]) => `${option}=${count}`)
      .join(", ");
    
    const totalOptions = Object.values(stats.options).reduce((a, b) => a + b, 0);
    const repartitionPct = Object.entries(stats.options)
      .map(([option, count]) => `${option}:${((count/stats.effectifTotal)*100).toFixed(1)}%`)
      .join(" | ");

    const rowData2 = [
      stats.classe,
      totalOptions,
      optionsDetail || "Aucune",
      repartitionPct || "0%"
    ];

    rowData2.forEach((value, colIndex) => {
      const cell = sheet.getRange(currentRow, colIndex + 1);
      cell.setValue(value);
      
      if (index % 2 === 0) {
        cell.setBackground("#fff3e0");  // Orange très pâle
      }
    });
    currentRow++;
  });

  currentRow += 2;

  // === SECTION 3: CODES DE RÉSERVATION ===
  sheet.getRange(currentRow, 1).setValue("🔐 CODES DE RÉSERVATION");
  sheet.getRange(currentRow, 1, 1, 5)
    .setFontWeight("bold")
    .setBackground("#d32f2f")  // Rouge foncé
    .setFontColor("#ffffff");
  currentRow++;

  // En-têtes section 3
  const headers3 = ["Classe", "Codes D", "Détail Codes D", "Codes A", "Détail Codes A"];
  headers3.forEach((header, index) => {
    sheet.getRange(currentRow, index + 1).setValue(header)
      .setFontWeight("bold")
      .setBackground("#ef5350")  // Rouge clair
      .setFontColor("#b71c1c");  // Rouge foncé
  });
  currentRow++;

  // Données section 3
  statistiques.forEach((stats, index) => {
    if (stats.top24Meilleurs || stats.top24Pires) return;
    
    const codesDetailD = Object.entries(stats.codesD)
      .map(([code, count]) => `${code}=${count}`)
      .join(", ");
    
    const codesDetailA = Object.entries(stats.codesA)
      .map(([code, count]) => `${code}=${count}`)
      .join(", ");

    const rowData3 = [
      stats.classe,
      stats.totalCodesD,
      codesDetailD || "Aucun",
      stats.totalCodesA,
      codesDetailA || "Aucun"
    ];

    rowData3.forEach((value, colIndex) => {
      const cell = sheet.getRange(currentRow, colIndex + 1);
      cell.setValue(value);
      
      if (index % 2 === 0) {
        cell.setBackground("#ffebee");  // Rouge très pâle
      }
    });
    currentRow++;
  });

  currentRow += 2;

  // === SECTION 4: PROFILS D'ÉLÈVES ===
  sheet.getRange(currentRow, 1).setValue("👥 PROFILS D'ÉLÈVES PAR CLASSE");
  sheet.getRange(currentRow, 1, 1, 9)
    .setFontWeight("bold")
    .setBackground("#388e3c")  // Vert foncé
    .setFontColor("#ffffff");
  currentRow++;

  // En-têtes section 4
  const headers4 = ["Classe", "COM=1 (Diff.)", "COM=2 (Moy-)", "COM=3 (Moy+)", "COM≥4 (Exc.)", "TRA≥4", "PART≥4", "ABS≥4", "Excellents"];
  headers4.forEach((header, index) => {
    sheet.getRange(currentRow, index + 1).setValue(header)
      .setFontWeight("bold")
      .setBackground("#66bb6a")  // Vert clair
      .setFontColor("#1b5e20");  // Vert foncé
  });
  currentRow++;

  // Fonction pour formater les listes d'élèves
  const formatElevesCompact = (liste) => {
    if (liste.length === 0) return "0";
    if (liste.length <= 2) return `${liste.length}: ${liste.join(", ")}`;
    return `${liste.length}: ${liste.slice(0, 2).join(", ")}...`;
  };

  // Données section 4
  statistiques.forEach((stats, index) => {
    if (stats.top24Meilleurs || stats.top24Pires) return;

    const rowData4 = [
      stats.classe,
      formatElevesCompact(stats.elevesCOM1),
      formatElevesCompact(stats.elevesCOM2),
      formatElevesCompact(stats.elevesCOM3),
      formatElevesCompact(stats.elevesCOM4),
      formatElevesCompact(stats.elevesTRA4),
      formatElevesCompact(stats.elevesPART4),
      formatElevesCompact(stats.elevesABS4),
      formatElevesCompact(stats.elevesExcellents)
    ];

    rowData4.forEach((value, colIndex) => {
      const cell = sheet.getRange(currentRow, colIndex + 1);
      cell.setValue(value);
      
      if (index % 2 === 0) {
        cell.setBackground("#e8f5e8");  // Vert très pâle
      }
      
      // Colorier les cellules selon le nombre d'élèves
      if (typeof value === "string" && value.includes(":")) {
        const nombre = parseInt(value.split(":")[0]);
        if (nombre >= 5) {
          cell.setBackground("#ffcdd2");  // Rouge pâle pour beaucoup
        } else if (nombre >= 3) {
          cell.setBackground("#fff9c4");  // Jaune pâle pour moyen
        }
      }
    });
    currentRow++;
  });

  currentRow += 3;

  // === SECTION 5: TOP 24 MEILLEURS ===
  if (statistiques.top24Meilleurs && statistiques.top24Meilleurs.length > 0) {
    sheet.getRange(currentRow, 1).setValue("🏆 TOP 24 ÉLÈVES - MEILLEURES MOYENNES");
    sheet.getRange(currentRow, 1)
      .setFontWeight("bold")
      .setFontSize(14)
      .setBackground("#2e7d32")  // Vert succès foncé
      .setFontColor("#ffffff");
    currentRow++;

    // En-têtes
    const headersMeilleurs = ["Rang", "Nom & Prénom", "Classe", "Moyenne", "Détail Scores"];
    headersMeilleurs.forEach((header, index) => {
      sheet.getRange(currentRow, index + 1).setValue(header)
        .setFontWeight("bold")
        .setBackground("#81c784")  // Vert succès clair
        .setFontColor("#1b5e20");
    });
    currentRow++;

    // Données
    statistiques.top24Meilleurs.forEach((eleve, index) => {
      const scoresDetail = `COM:${eleve.scores.COM} TRA:${eleve.scores.TRA} PART:${eleve.scores.PART} ABS:${eleve.scores.ABS}`;
      
      const rowData = [
        index + 1,
        eleve.nom,
        eleve.classe,
        eleve.moyenne.toFixed(2),
        scoresDetail
      ];
      
      rowData.forEach((value, colIndex) => {
        const cell = sheet.getRange(currentRow, colIndex + 1);
        cell.setValue(value);
        
        if (index < 4) {
          cell.setBackground("#fff176");  // Jaune or
        } else if (index < 12) {
          cell.setBackground("#c8e6c9");  // Vert pâle
        }
      });
      currentRow++;
    });
  }

  currentRow += 2;

  // === SECTION 6: TOP 24 PIRES ===
  if (statistiques.top24Pires && statistiques.top24Pires.length > 0) {
    sheet.getRange(currentRow, 1).setValue("⚠️ TOP 24 ÉLÈVES - PLUS BASSES MOYENNES");
    sheet.getRange(currentRow, 1)
      .setFontWeight("bold")
      .setFontSize(14)
      .setBackground("#c62828")  // Rouge attention foncé
      .setFontColor("#ffffff");
    currentRow++;

    // En-têtes
    const headersPires = ["Rang", "Nom & Prénom", "Classe", "Moyenne", "Détail Scores"];
    headersPires.forEach((header, index) => {
      sheet.getRange(currentRow, index + 1).setValue(header)
        .setFontWeight("bold")
        .setBackground("#e57373")  // Rouge attention clair
        .setFontColor("#b71c1c");
    });
    currentRow++;

    // Données
    statistiques.top24Pires.forEach((eleve, index) => {
      const scoresDetail = `COM:${eleve.scores.COM} TRA:${eleve.scores.TRA} PART:${eleve.scores.PART} ABS:${eleve.scores.ABS}`;
      
      const rowData = [
        index + 1,
        eleve.nom,
        eleve.classe,
        eleve.moyenne.toFixed(2),
        scoresDetail
      ];
      
      rowData.forEach((value, colIndex) => {
        const cell = sheet.getRange(currentRow, colIndex + 1);
        cell.setValue(value);
        
        if (index < 4) {
          cell.setBackground("#ffcdd2");  // Rouge pâle
        } else if (index < 12) {
          cell.setBackground("#fff3e0");  // Orange très pâle
        }
      });
      currentRow++;
    });
  }

  // === MISE EN FORME FINALE ===
  
  // Ajuster TOUTES les largeurs automatiquement
  sheet.autoResizeColumns(1, 15);
  
  // Pas de figement de colonnes (pour éviter l'erreur)
  sheet.setFrozenRows(1);  // Seulement figer la première ligne
  
  // Activer l'onglet
  ss.setActiveSheet(sheet);
  
  Logger.log(`✅ Résultats MAGNIFIQUES affichés dans l'onglet "${nomOnglet}"`);
}