/**
 * ===================================================================
 * ⚖️ PRIME LEGACY - PHASE 3 : EFFECTIFS & PARITÉ
 * ===================================================================
 *
 * Basé sur : OPTIMUM PRIME Phase 3
 * Phase 3 : Complète effectifs et équilibre parité F/M
 * LIT : Onglets TEST
 * ÉCRIT : Onglets TEST (update _CLASS_ASSIGNED)
 *
 * Dernière modification : 2026-07-01 — branche 2028
 * (parité alignée sur le RATIO GLOBAL F/M, cohérente avec Phase 4 : voir
 *  globalRatioF/excess1/excess2 vers la ligne ~320)
 *
 * ===================================================================
 */

/**
 * Phase 3 LEGACY : Complète effectifs et équilibre parité
 * ✅ IMPLÉMENTATION FONCTIONNELLE basée sur OPTIMUM PRIME
 */
function Phase3I_completeAndParity_LEGACY(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 3 LEGACY - Effectifs & Parité (OPTIMUM PRIME)');
  logLine('INFO', '='.repeat(80));

  const ss = ctx.ss || SpreadsheetApp.getActive();
  const tolParite = ctx.tolParite || 2;

  // ========== CONSOLIDER DONNÉES (SAC DE BILLES) ==========
  // 🎯 Fusionner TEST (déjà placés) + SOURCE (encore dans le sac)
  const consolidated = getConsolidatedData_LEGACY(ctx);
  const allData = consolidated.allData;
  const headersRef = consolidated.headersRef;

  if (allData.length === 0) {
    return { ok: false, message: 'Aucun élève trouvé' };
  }

  const idxAssigned = headersRef.indexOf('_CLASS_ASSIGNED');
  const idxSexe = headersRef.indexOf('SEXE');
  const idxNom = headersRef.indexOf('NOM');
  const idxLV2 = headersRef.indexOf('LV2');
  const idxOPT = headersRef.indexOf('OPT');
  const idxASSO = headersRef.indexOf('ASSO'); // ✅ Ajout pour protéger groupes ASSO

  // 🌟 APPROCHE UNIVERSELLE : Détecter LV2 universelles
  const allClasses = ctx.niveaux || [];
  const nbClasses = allClasses.length;
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
  
  // Ajouter au contexte pour accès dans les fonctions
  ctx.lv2Universelles = lv2Universelles;

  // ========== RÉÉQUILIBRAGE EFFECTIFS (BUG #3 CORRECTION) ==========
  logLine('INFO', '📊 Rééquilibrage des effectifs...');
  
  // Calculer effectifs actuels vs cibles
  const classCounts = {};
  (ctx.niveaux || []).forEach(function(cls) {
    classCounts[cls] = 0;
  });
  
  for (let i = 0; i < allData.length; i++) {
    const cls = String(allData[i].row[idxAssigned] || '').trim();
    if (cls && classCounts[cls] !== undefined) {
      classCounts[cls]++;
    }
  }

  // Identifier classes sur/sous-chargées
  const overloaded = [];
  const underloaded = [];
  
  for (const cls in classCounts) {
    const target = (ctx.targets && ctx.targets[cls]) || 27;
    const current = classCounts[cls];
    const gap = current - target;
    
    logLine('INFO', '  • ' + cls + ' : ' + current + '/' + target + ' (' + (gap > 0 ? '+' : '') + gap + ')');
    
    if (gap > 0) overloaded.push({ cls: cls, gap: gap });
    if (gap < 0) underloaded.push({ cls: cls, gap: -gap });
  }

  // Déplacer élèves des classes surchargées vers sous-chargées
  let moved = 0;
  for (let o = 0; o < overloaded.length && underloaded.length > 0; o++) {
    const over = overloaded[o];
    
    while (over.gap > 0 && underloaded.length > 0) {
      // Trouver élève mobile dans classe surchargée
      let movedStudent = false;
      
      for (let i = 0; i < allData.length && !movedStudent; i++) {
        const item = allData[i];
        const cls = String(item.row[idxAssigned] || '').trim();
        if (cls !== over.cls) continue;
        
        // Vérifier si élève peut être déplacé (a ESP, pas d'option spéciale)
        const lv2 = String(item.row[idxLV2] || '').trim().toUpperCase();
        const opt = String(item.row[idxOPT] || '').trim().toUpperCase();

        // ✅ PROTECTION GROUPES ASSO : Ne pas déplacer élèves avec code ASSO
        const asso = String(item.row[idxASSO] || '').trim().toUpperCase();
        if (asso) {
          // Élève fait partie d'un groupe ASSO, on ne le déplace pas
          continue;
        }

        // Chercher classe sous-chargée compatible
        for (let u = 0; u < underloaded.length && !movedStudent; u++) {
          const under = underloaded[u];
          if (under.gap <= 0) continue;
          
          // Vérifier compatibilité LV2/OPT
          const targetQuotas = (ctx.quotas && ctx.quotas[under.cls]) || {};
          let compatible = false;
          
          if (lv2 === 'ESP' && targetQuotas['ESP'] > 0) compatible = true;
          else if (opt && targetQuotas[opt] > 0) compatible = true;
          else if (!lv2 && !opt) compatible = true;
          
          if (compatible) {
            const nom = String(item.row[idxNom] || '');
            logLine('INFO', '  🔄 Rééquilibrage : ' + nom + ' : ' + cls + ' → ' + under.cls);
            
            item.row[idxAssigned] = under.cls;
            over.gap--;
            under.gap--;
            classCounts[over.cls]--;
            classCounts[under.cls]++;
            moved++;
            movedStudent = true;
          }
        }
      }
      
      if (!movedStudent) break; // Aucun élève mobile trouvé
    }
  }
  
  logLine('INFO', '  ✅ ' + moved + ' élèves rééquilibrés');

  // ========== PLACER ÉLÈVES NON ASSIGNÉS (PLACEMENT INTELLIGENT PAR PROFIL) ==========
  const idxDISSO = headersRef.indexOf('DISSO');
  const idxCOM = headersRef.indexOf('COM');
  const idxTRA = headersRef.indexOf('TRA');
  const idxPART = headersRef.indexOf('PART');
  const idxABS = headersRef.indexOf('ABS');
  let placed = 0;

  // Calculer les moyennes COM/TRA par classe pour guider le placement
  function getClassProfileAvg(cls) {
    let sumCOM = 0, sumTRA = 0, count = 0;
    for (let j = 0; j < allData.length; j++) {
      if (String(allData[j].row[idxAssigned] || '').trim() !== cls) continue;
      sumCOM += Number(allData[j].row[idxCOM] || 2.5);
      sumTRA += Number(allData[j].row[idxTRA] || 2.5);
      count++;
    }
    return count > 0 ? { com: sumCOM / count, tra: sumTRA / count } : { com: 2.5, tra: 2.5 };
  }

  // Calculer les moyennes globales (cibles)
  let globalSumCOM = 0, globalSumTRA = 0, globalCount = 0;
  for (let j = 0; j < allData.length; j++) {
    globalSumCOM += Number(allData[j].row[idxCOM] || 2.5);
    globalSumTRA += Number(allData[j].row[idxTRA] || 2.5);
    globalCount++;
  }
  const globalAvgCOM = globalCount > 0 ? globalSumCOM / globalCount : 2.5;
  const globalAvgTRA = globalCount > 0 ? globalSumTRA / globalCount : 2.5;

  // Collecter les élèves non assignés
  const unassigned = [];
  for (let i = 0; i < allData.length; i++) {
    if (!String(allData[i].row[idxAssigned] || '').trim()) {
      unassigned.push(i);
    }
  }

  // Trier les non-assignés par profil extrême d'abord (COM=1 ou COM=4 en premier)
  // pour que les profils les plus impactants soient placés quand il y a le plus de choix
  unassigned.sort(function(a, b) {
    const comA = Number(allData[a].row[idxCOM] || 2.5);
    const comB = Number(allData[b].row[idxCOM] || 2.5);
    const distA = Math.abs(comA - 2.5);
    const distB = Math.abs(comB - 2.5);
    return distB - distA; // Profils extrêmes en premier
  });

  for (let u = 0; u < unassigned.length; u++) {
    const i = unassigned[u];
    const item = allData[i];

    const lv2 = String(item.row[idxLV2] || '').trim().toUpperCase();
    const opt = String(item.row[idxOPT] || '').trim().toUpperCase();
    const disso = String(item.row[idxDISSO] || '').trim().toUpperCase();
    const nom = String(item.row[idxNom] || '');
    const eleveCOM = Number(item.row[idxCOM] || 2.5);
    const eleveTRA = Number(item.row[idxTRA] || 2.5);

    let targetClass = null;
    let bestScore = Infinity;

    // Trouver la classe qui BÉNÉFICIE le plus de ce profil (rapproche la moyenne de la cible)
    for (const cls in (ctx.targets || {})) {
      const quotas = (ctx.quotas && ctx.quotas[cls]) || {};
      const current = classCounts[cls] || 0;
      const target = ctx.targets[cls] || 27;

      if (current >= target) continue;

      // Vérifier compatibilité LV2
      let compatible = true;
      if (lv2 && lv2Universelles.indexOf(lv2) === -1 && isKnownLV2(lv2)) {
        if (!quotas[lv2] || quotas[lv2] <= 0) compatible = false;
      }

      // Vérifier compatibilité OPT
      if (opt && isKnownOPT(opt)) {
        if (!quotas[opt] || quotas[opt] <= 0) compatible = false;
      }

      // Vérifier DISSO
      if (disso && compatible) {
        for (let j = 0; j < allData.length; j++) {
          if (i === j) continue;
          const otherAssigned = String(allData[j].row[idxAssigned] || '').trim();
          if (otherAssigned !== cls) continue;
          const otherDisso = String(allData[j].row[idxDISSO] || '').trim().toUpperCase();
          if (partageCodeDisso_(otherDisso, disso)) {  // multi-codes
            compatible = false;
            break;
          }
        }
      }

      if (!compatible) continue;

      // SCORING INTELLIGENT : Combiner besoin en effectif + besoin en profil
      const slotNeed = (target - current) / target; // 0..1 : besoin en place
      const classAvg = getClassProfileAvg(cls);

      // Écart de la classe par rapport à la cible APRÈS ajout de cet élève
      const newAvgCOM = (classAvg.com * current + eleveCOM) / (current + 1);
      const newAvgTRA = (classAvg.tra * current + eleveTRA) / (current + 1);
      const profileGap = Math.abs(newAvgCOM - globalAvgCOM) + Math.abs(newAvgTRA - globalAvgTRA);

      // Score combiné : on minimise l'écart de profil tout en favorisant les classes qui ont besoin de monde
      const combinedScore = profileGap - slotNeed * 0.5;

      if (combinedScore < bestScore) {
        bestScore = combinedScore;
        targetClass = cls;
      }
    }

    if (!targetClass) {
      // PLACEMENT FORCÉ — mais JAMAIS au mépris d'une option/LV2 rare. Si la (ou
      // les) classe(s) qui OFFRENT l'option de l'élève sont pleines, on l'y place
      // QUAND MÊME (dépassement d'effectif toléré : une option est une contrainte
      // horaire intouchable, un effectif se rééquilibre en Phase 4). On ne tombe
      // sur « la moins peuplée » que pour les élèves SANS option rare — sinon un
      // ITA finissait en classe CHAV (cause du bug « ITA en 6°3 »).
      var aOptionRare = (lv2 && isKnownLV2(lv2) && lv2Universelles.indexOf(lv2) === -1) ||
                        (opt && isKnownOPT(opt));
      if (aOptionRare) {
        var classesOffrant = [];
        for (var clsF in (ctx.targets || {})) {
          var qF = (ctx.quotas && ctx.quotas[clsF]) || {};
          var okLV2 = (lv2 && isKnownLV2(lv2) && lv2Universelles.indexOf(lv2) === -1) ? (qF[lv2] > 0) : true;
          var okOPT = (opt && isKnownOPT(opt)) ? (qF[opt] > 0) : true;
          if (okLV2 && okOPT) classesOffrant.push(clsF);
        }
        if (classesOffrant.length) {
          classesOffrant.sort(function (a, b) { return (classCounts[a] || 0) - (classCounts[b] || 0); });
          targetClass = classesOffrant[0];
          logLine('WARN', '    ⚠️ ' + nom + ' : classe(s) d\'option pleine(s) → placé dans ' + targetClass +
            ' (option ' + (lv2 || opt) + ' PRÉSERVÉE, dépassement d\'effectif toléré, corrigé en Phase 4).');
        }
      }
      if (!targetClass) {
        targetClass = findLeastPopulatedClass_Phase3(allData, headersRef, ctx);
        logLine('WARN', '    ⚠️ ' + nom + ' : aucune classe compatible → placement forcé dans ' + targetClass);
      }
    }

    item.row[idxAssigned] = targetClass;
    classCounts[targetClass] = (classCounts[targetClass] || 0) + 1;
    placed++;

    const logDetails = [];
    if (lv2) logDetails.push('LV2=' + lv2);
    if (opt) logDetails.push('OPT=' + opt);
    if (disso) logDetails.push('DISSO=' + disso);
    logDetails.push('COM=' + eleveCOM);
    logLine('INFO', '    ✅ ' + nom + ' → ' + targetClass + ' (' + logDetails.join(', ') + ') [' + classCounts[targetClass] + '/' + (ctx.targets[targetClass] || 27) + ']');
  }

  logLine('INFO', '  ✅ ' + placed + ' élèves non assignés placés');

  // ========== ÉQUILIBRER PARITÉ ==========
  let swaps = 0;
  for (let iter = 0; iter < 100; iter++) {
    let improved = false;

    // Calculer parité par classe
    const paritiesByClass = {};
    (ctx.niveaux || []).forEach(function(cls) {
      paritiesByClass[cls] = { F: 0, M: 0, total: 0 };
    });

    for (let i = 0; i < allData.length; i++) {
      const cls = String(allData[i].row[idxAssigned] || '').trim();
      const sexe = String(allData[i].row[idxSexe] || '').toUpperCase();
      if (cls && paritiesByClass[cls]) {
        paritiesByClass[cls].total++;
        if (sexe === 'F') paritiesByClass[cls].F++;
        else if (sexe === 'M') paritiesByClass[cls].M++;
      }
    }

    // Ratio F GLOBAL = cible ADAPTATIVE, cohérente avec Phase4 (globalStats.ratioF).
    // Avant, Phase3 visait 50/50 par classe (|F-M|) alors que Phase4 vise le ratio
    // global → sur un vivier non paritaire (ex. 60% M) les deux se défaisaient
    // mutuellement. On vise désormais la même cible que Phase4.
    let _totF = 0, _totAll = 0;
    for (const _c in paritiesByClass) { _totF += paritiesByClass[_c].F; _totAll += paritiesByClass[_c].total; }
    const globalRatioF = _totAll > 0 ? _totF / _totAll : 0.5;

    // Trouver classes déséquilibrées vs le ratio global
    for (const cls1 in paritiesByClass) {
      const p1 = paritiesByClass[cls1];
      const excess1 = p1.F - globalRatioF * p1.total; // >0 : trop de filles ; <0 : trop de garçons

      if (Math.abs(excess1) <= tolParite) continue;

      // Chercher swap avec autre classe
      for (const cls2 in paritiesByClass) {
        if (cls1 === cls2) continue;

        const p2 = paritiesByClass[cls2];
        const excess2 = p2.F - globalRatioF * p2.total;

        // Déséquilibres OPPOSÉS vs le ratio global → swap bénéfique
        if ((excess1 > 0 && excess2 < 0) || (excess1 < 0 && excess2 > 0)) {
          // cls1 donne ce dont cls2 a besoin et reçoit ce dont cls1 a besoin
          const sexeNeeded1 = excess1 > 0 ? 'M' : 'F';
          const sexeNeeded2 = excess2 > 0 ? 'M' : 'F';

          let idx1 = -1, idx2 = -1;

          for (let i = 0; i < allData.length; i++) {
            if (idx1 >= 0 && idx2 >= 0) break;

            const cls = String(allData[i].row[idxAssigned] || '').trim();
            const sexe = String(allData[i].row[idxSexe] || '').toUpperCase();

            // ✅ FAILLE #2 CORRECTION : Vérifier éligibilité AVANT sélection
            if (cls === cls1 && sexe === sexeNeeded2 && idx1 === -1) {
              if (canSwapForParity_Phase3(i, cls2, allData, headersRef, ctx)) {
                idx1 = i;
              }
            }
            if (cls === cls2 && sexe === sexeNeeded1 && idx2 === -1) {
              if (canSwapForParity_Phase3(i, cls1, allData, headersRef, ctx)) {
                idx2 = i;
              }
            }
          }

          if (idx1 >= 0 && idx2 >= 0) {
            // 📋 LOG détaillé AVANT le swap
            const s1 = allData[idx1];
            const s2 = allData[idx2];
            const nom1 = s1.row[idxNom];
            const nom2 = s2.row[idxNom];
            const disso1 = idxDISSO >= 0 ? String(s1.row[idxDISSO] || '').trim().toUpperCase() : '';
            const disso2 = idxDISSO >= 0 ? String(s2.row[idxDISSO] || '').trim().toUpperCase() : '';

            const details1 = [];
            if (String(s1.row[idxLV2] || '').trim()) details1.push('LV2=' + String(s1.row[idxLV2]).trim());
            if (String(s1.row[idxOPT] || '').trim()) details1.push('OPT=' + String(s1.row[idxOPT]).trim());
            if (disso1) details1.push('DISSO=' + disso1);

            const details2 = [];
            if (String(s2.row[idxLV2] || '').trim()) details2.push('LV2=' + String(s2.row[idxLV2]).trim());
            if (String(s2.row[idxOPT] || '').trim()) details2.push('OPT=' + String(s2.row[idxOPT]).trim());
            if (disso2) details2.push('DISSO=' + disso2);

            // Swap
            allData[idx1].row[idxAssigned] = cls2;
            allData[idx2].row[idxAssigned] = cls1;
            swaps++;
            improved = true;

            logLine('INFO', '  🔄 Swap parité #' + swaps + ' :');
            logLine('INFO', '    • ' + nom1 + ' : ' + cls1 + ' → ' + cls2 + ' (' + details1.join(', ') + ')');
            logLine('INFO', '    • ' + nom2 + ' : ' + cls2 + ' → ' + cls1 + ' (' + details2.join(', ') + ')');
            break;
          }
        }
      }

      if (improved) break;
    }

    if (!improved) break;
  }

  logLine('INFO', '  ✅ ' + swaps + ' swaps parité appliqués');

  // ========== RÉPARATION DES OPTIONS RARES (filet final) ==========
  // Quelle que soit la phase qui l'a déplacé (Phase 2 ASSO/DISSO, repli Phase 3…),
  // tout élève à LV2/OPT rare doit finir dans une classe qui l'offre. On le ramène
  // (échange avec un ESP sans contrainte si possible, sinon déplacement).
  reparerOptionsRares_Phase3(allData, headersRef, ctx);

  // ========== RÉÉCRIRE PAR CLASSE ASSIGNÉE ==========
  // ✅ CORRECTION : Regrouper par _CLASS_ASSIGNED pour que les swaps soient effectifs
  const byClass = {};
  for (let i = 0; i < allData.length; i++) {
    const item = allData[i];
    const assigned = String(item.row[idxAssigned] || '').trim();
    if (assigned) {
      if (!byClass[assigned]) byClass[assigned] = [];
      byClass[assigned].push(item.row);
    }
  }

  // Écrire dans les onglets TEST correspondants
  for (const className in byClass) {
    const testSheetName = className + 'TEST';
    const testSheet = ss.getSheetByName(testSheetName);
    if (!testSheet) {
      logLine('WARN', '⚠️ Onglet ' + testSheetName + ' introuvable, skip');
      continue;
    }

    const rows = byClass[className];
    const allRows = [headersRef].concat(rows);
    
    // Effacer contenu existant et écrire nouvelles données
    testSheet.clearContents();
    testSheet.getRange(1, 1, allRows.length, headersRef.length).setValues(allRows);
    
    logLine('INFO', '  ✅ ' + testSheetName + ' : ' + rows.length + ' élèves');
  }

  SpreadsheetApp.flush();

  logLine('INFO', '✅ PHASE 3 LEGACY terminée : ' + placed + ' placés, ' + swaps + ' swaps parité');

  // 🔍 VALIDATION FINALE : Vérifier absence de duplications DISSO
  const validationResult = validateDISSOConstraints_Phase3(allData, headersRef);
  if (!validationResult.ok) {
    logLine('ERROR', '❌ VALIDATION DISSO ÉCHOUÉE après Phase 3 !');
    logLine('ERROR', '  Duplications détectées : ' + validationResult.duplicates.length);
    validationResult.duplicates.forEach(function(dup) {
      logLine('ERROR', '    • ' + dup.classe + ' : ' + dup.code + ' présent ' + dup.count + ' fois (' + dup.noms.join(', ') + ')');
    });
  } else {
    logLine('INFO', '✅ Validation DISSO : Aucune duplication détectée');
  }

  return { ok: true, message: 'Phase 3 terminée', placed: placed, swaps: swaps, validation: validationResult };
}

/**
 * FILET FINAL OPTIONS RARES : garantit l'invariant « un élève à LV2/OPT rare est
 * dans une classe qui l'offre ». Corrige toute fuite (ITA en classe CHAV…) laissée
 * par une phase amont. Échange avec un ESP libre (sans option, sans ASSO) pour
 * préserver les effectifs ; à défaut, déplace (l'effectif est repris en Phase 4).
 */
function reparerOptionsRares_Phase3(allData, headersRef, ctx) {
  var idxAssigned = headersRef.indexOf('_CLASS_ASSIGNED');
  var idxLV2 = headersRef.indexOf('LV2'), idxOPT = headersRef.indexOf('OPT');
  var idxASSO = headersRef.indexOf('ASSO'), idxNom = headersRef.indexOf('NOM');
  if (idxAssigned === -1) return 0;
  var univ = ctx.lv2Universelles || [];

  // ESP = LV2 par défaut de l'établissement : jamais une contrainte, même sans
  // quota déclaré dans _STRUCTURE (sinon les ESP sont vus comme « rares » et ne
  // peuvent plus servir de partenaire d'échange).
  function lv2Contraignante(lv2) {
    return lv2 && lv2 !== 'ESP' && isKnownLV2(lv2) && univ.indexOf(lv2) === -1;
  }
  function estRare(lv2, opt) {
    return lv2Contraignante(lv2) || (opt && isKnownOPT(opt));
  }
  function classeOffre(cls, lv2, opt) {
    var q = (ctx.quotas && ctx.quotas[cls]) || {};
    if (lv2Contraignante(lv2) && !(q[lv2] > 0)) return false;
    if (opt && isKnownOPT(opt) && !(q[opt] > 0)) return false;
    return true;
  }

  var repares = 0;
  for (var i = 0; i < allData.length; i++) {
    var row = allData[i].row;
    var lv2 = String(row[idxLV2] || '').trim().toUpperCase();
    var opt = String(row[idxOPT] || '').trim().toUpperCase();
    if (!estRare(lv2, opt)) continue;
    var cls = String(row[idxAssigned] || '').trim();
    if (cls && classeOffre(cls, lv2, opt)) continue; // déjà bien placé

    var cible = null;
    for (var c in (ctx.quotas || {})) { if (classeOffre(c, lv2, opt)) { cible = c; break; } }
    if (!cible || cible === cls) continue; // aucune classe n'offre → contradiction structure

    // Chercher un ESP « échangeable » dans la classe cible (sans option, sans ASSO)
    var part = -1;
    for (var j = 0; j < allData.length; j++) {
      if (String(allData[j].row[idxAssigned] || '').trim() !== cible) continue;
      var jl = String(allData[j].row[idxLV2] || '').trim().toUpperCase();
      var jo = String(allData[j].row[idxOPT] || '').trim().toUpperCase();
      if (estRare(jl, jo)) continue;                                   // ne pas déloger un autre optionné
      if (idxASSO >= 0 && String(allData[j].row[idxASSO] || '').trim()) continue; // pas d'ASSO
      part = j; break;
    }
    if (part >= 0) {
      allData[part].row[idxAssigned] = cls || cible;
      row[idxAssigned] = cible;
      logLine('WARN', '  🔧 Option réparée (échange) : ' + String(row[idxNom] || '') + ' [' + (lv2 || opt) + '] ' + (cls || '∅') + '→' + cible);
    } else {
      row[idxAssigned] = cible;
      logLine('WARN', '  🔧 Option réparée (déplacement) : ' + String(row[idxNom] || '') + ' [' + (lv2 || opt) + '] ' + (cls || '∅') + '→' + cible + ' (effectif ajusté en Phase 4)');
    }
    repares++;
  }
  if (repares) logLine('INFO', '  🔧 ' + repares + ' élève(s) à option rare replacé(s) dans leur classe.');
  return repares;
}

function findLeastPopulatedClass_Phase3(allData, headers, ctx) {
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const counts = {};

  (ctx.niveaux || []).forEach(function(cls) {
    counts[cls] = 0;
  });

  for (let i = 0; i < allData.length; i++) {
    const cls = String(allData[i].row[idxAssigned] || '').trim();
    if (cls && counts[cls] !== undefined) {
      counts[cls]++;
    }
  }

  let minClass = null;
  let minCount = Infinity;
  for (const cls in counts) {
    if (counts[cls] < minCount) {
      minCount = counts[cls];
      minClass = cls;
    }
  }

  return minClass || (ctx.niveaux && ctx.niveaux[0]) || '6°1';
}

/**
 * ✅ FAILLE #2 CORRECTION : Vérifie si un élève peut être swappé vers une classe
 * sans violer les contraintes FIXE/Options/DISSO
 */
function canSwapForParity_Phase3(studentIdx, targetClass, allData, headers, ctx) {
  const student = allData[studentIdx];
  const row = student.row;
  
  // Index des colonnes
  const idxLV2 = headers.indexOf('LV2');
  const idxOPT = headers.indexOf('OPT');
  const idxFIXE = headers.indexOf('FIXE');
  const idxMOBILITE = headers.indexOf('MOBILITE');
  const idxDISSO = headers.indexOf('DISSO');
  const idxASSO = headers.indexOf('ASSO'); // ✅ Protection groupes ASSO

  // 1. Vérifier si élève est FIXE
  const fixe = String(row[idxFIXE] || '').toUpperCase();
  const mobilite = String(row[idxMOBILITE] || '').toUpperCase();
  
  if (fixe.includes('FIXE') || fixe.includes('OUI') || mobilite.includes('FIXE')) {
    return false; // Élève FIXE ne peut pas être swappé
  }

  // 1.2 📌 CLASSE IMPOSÉE : si l'élève a une (ou plusieurs) classe(s) imposée(s)
  //     via la colonne CLASSE_IMPOSEE (ex. "4°2|4°3"), il ne peut être déplacé
  //     que vers une de ces classes — jamais ailleurs (sinon la parité défaisait
  //     l'imposition du pré-placement).
  const idxImposee = headers.indexOf('CLASSE_IMPOSEE');
  if (idxImposee !== -1) {
    const rawImp = String(row[idxImposee] || '').trim();
    if (rawImp && rawImp.split('|').map(function (c) { return c.trim(); }).indexOf(targetClass) === -1) {
      return false; // Cible hors de l'ensemble imposé
    }
  }

  // 1.5 ✅ Vérifier si élève fait partie d'un groupe ASSO
  const asso = String(row[idxASSO] || '').trim().toUpperCase();
  if (asso) {
    return false; // Élève ASSO ne peut pas être swappé individuellement
  }

  // 2. Vérifier compatibilité LV2/OPT avec la classe cible
  const lv2 = String(row[idxLV2] || '').trim().toUpperCase();
  const opt = String(row[idxOPT] || '').trim().toUpperCase();
  
  if (lv2 || opt) {
    const quotas = (ctx && ctx.quotas && ctx.quotas[targetClass]) || {};
    const lv2Universelles = (ctx && ctx.lv2Universelles) || [];
    
    // Vérifier si la classe cible propose cette option (LV2 universelles toujours OK)
    if (lv2 && lv2Universelles.indexOf(lv2) === -1 && isKnownLV2(lv2)) {
      if (!quotas[lv2] || quotas[lv2] <= 0) {
        return false; // Classe cible ne propose pas cette LV2
      }
    }

    if (opt && isKnownOPT(opt)) {
      if (!quotas[opt] || quotas[opt] <= 0) {
        return false; // Classe cible ne propose pas cette option
      }
    }
  }
  
  // 3. Vérifier conflits DISSO dans la classe cible
  const disso = String(row[idxDISSO] || '').trim().toUpperCase();
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  
  if (disso) {
    for (let i = 0; i < allData.length; i++) {
      if (i === studentIdx) continue;
      
      const otherClass = String(allData[i].row[idxAssigned] || '').trim();
      if (otherClass !== targetClass) continue;
      
      const otherDisso = String(allData[i].row[idxDISSO] || '').trim().toUpperCase();
      if (otherDisso === disso) {
        return false; // Conflit DISSO dans la classe cible
      }
    }
  }
  
  return true; // Swap autorisé
}

/**
 * 🔍 VALIDATION FINALE : Vérifie qu'il n'y a pas de codes DISSO dupliqués dans les classes
 */
function validateDISSOConstraints_Phase3(allData, headers) {
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const idxDISSO = headers.indexOf('DISSO');
  const idxNom = headers.indexOf('NOM');

  if (idxDISSO === -1) {
    return { ok: true, message: 'Colonne DISSO non trouvée' };
  }

  // Grouper par classe
  const byClass = {};
  for (let i = 0; i < allData.length; i++) {
    const cls = String(allData[i].row[idxAssigned] || '').trim();
    if (!cls) continue;

    if (!byClass[cls]) byClass[cls] = [];
    byClass[cls].push(allData[i]);
  }

  // Vérifier chaque classe
  const duplicates = [];
  for (const cls in byClass) {
    const students = byClass[cls];
    const dissoCounts = {};

    for (let i = 0; i < students.length; i++) {
      const disso = String(students[i].row[idxDISSO] || '').trim().toUpperCase();
      if (!disso) continue;

      if (!dissoCounts[disso]) {
        dissoCounts[disso] = {
          code: disso,
          count: 0,
          noms: []
        };
      }

      dissoCounts[disso].count++;
      dissoCounts[disso].noms.push(String(students[i].row[idxNom] || ''));
    }

    // Détecter duplications
    for (const code in dissoCounts) {
      if (dissoCounts[code].count > 1) {
        duplicates.push({
          classe: cls,
          code: code,
          count: dissoCounts[code].count,
          noms: dissoCounts[code].noms
        });
      }
    }
  }

  return {
    ok: duplicates.length === 0,
    duplicates: duplicates
  };
}
