/**
 * ===================================================================
 * IMPORTASSISTANT_SERVER.JS
 * ===================================================================
 *
 * Assistant d'import guide autour du moteur existant Backend_ImportDB.js.
 *
 * Objectif:
 * - reutiliser les parseurs v3_parse* existants;
 * - ajouter un preflight lisible avant ecriture;
 * - eviter une compilation trop tot ou silencieuse;
 * - afficher les matches/non-matches et le plan d'ecriture.
 */

function ouvrirImportAssistant() {
  var html = HtmlService.createHtmlOutputFromFile('ImportAssistant')
    .setWidth(1500)
    .setHeight(920)
    .setTitle('Assistant Import Pronote');

  SpreadsheetApp.getUi().showModelessDialog(html, 'Assistant Import Pronote');
}

function ia_parseStudents(rows) {
  try {
    var result = v3_parseListeEleves(rows);
    if (!result || !result.success) return result || { success: false, error: 'Analyse eleves impossible' };

    result.diagnostics = ia_analyzeStudents_(result.eleves || []);
    return result;
  } catch (e) {
    return ia_error_(e);
  }
}

function ia_parseNotes(rows) {
  try {
    var result = v3_parseNotesMoyennes(rows);
    if (!result || !result.success) return result || { success: false, error: 'Analyse notes impossible' };

    return result;
  } catch (e) {
    return ia_error_(e);
  }
}

function ia_parseAbsences(rows) {
  try {
    return v3_parseAbsences(rows);
  } catch (e) {
    return ia_error_(e);
  }
}

function ia_parseBehavior(payload) {
  try {
    payload = payload || {};
    var out = {
      success: true,
      observations: null,
      punitions: null,
      incidents: null,
      errors: []
    };

    if (payload.observationsRows && payload.observationsRows.length >= 2) {
      out.observations = v3_parseObservations(payload.observationsRows);
      if (!out.observations.success) out.errors.push('Observations: ' + out.observations.error);
    }

    if (payload.punitionsRows && payload.punitionsRows.length >= 2) {
      out.punitions = v3_parsePunitions(payload.punitionsRows);
      if (!out.punitions.success) out.errors.push('Punitions: ' + out.punitions.error);
    }

    if (payload.incidentsRows && payload.incidentsRows.length >= 2) {
      out.incidents = v3_parseIncidents(payload.incidentsRows);
      if (!out.incidents.success) out.errors.push('Incidents: ' + out.incidents.error);
    }

    out.success = out.errors.length === 0;
    out.count = (out.observations && out.observations.count || 0) +
      (out.punitions && out.punitions.count || 0) +
      (out.incidents && out.incidents.count || 0);

    return out;
  } catch (e) {
    return ia_error_(e);
  }
}

function ia_buildImportPreflight(payload) {
  try {
    var t0 = Date.now();
    payload = payload || {};
    var state = payload.state || {};
    var skips = payload.skips || {};
    var issues = [];

    var elevesList = ia_extractStudents_(state);
    var notesResults = ia_extractNotes_(state);
    var absencesList = ia_extractArray_(state.absences, 'absences');
    var observationsList = ia_extractArray_(state.observations, 'observations');
    var punitionsList = ia_extractArray_(state.punitions, 'punitions');
    var incidentsList = ia_extractArray_(state.incidents, 'incidents');

    if (elevesList.length === 0) {
      issues.push(ia_issue_('error', 'NO_STUDENTS', 'Aucune liste eleves valide. L etape 1 est obligatoire.'));
    }

    var studentBuild = ia_buildStudentMap_(elevesList);
    var matchIndex = studentBuild.matchIndex;
    issues = issues.concat(studentBuild.issues);

    if (notesResults.length === 0) {
      if (skips.notes) {
        issues.push(ia_issue_('warning', 'NOTES_SKIPPED', 'Notes ignorees volontairement. Les scores TRA et PART seront incomplets.'));
      } else {
        issues.push(ia_issue_('error', 'NOTES_MISSING_CONFIRMATION', 'Notes non importees. Clique sur "Je n ai pas de notes" ou importe les notes.'));
      }
    }

    if (absencesList.length === 0) {
      if (skips.absences) {
        issues.push(ia_issue_('warning', 'ABSENCES_SKIPPED', 'Absences ignorees volontairement. Le score ABS sera calcule sans donnees d absence.'));
      } else {
        issues.push(ia_issue_('warning', 'ABSENCES_NOT_IMPORTED', 'Absences non importees. Elles seront considerees comme vides si tu continues.'));
      }
    }

    if (observationsList.length === 0 && punitionsList.length === 0 && incidentsList.length === 0) {
      if (skips.behavior) {
        issues.push(ia_issue_('warning', 'BEHAVIOR_SKIPPED', 'Vie scolaire ignoree volontairement. Le score COM sera calcule sans donnees de comportement.'));
      } else {
        issues.push(ia_issue_('warning', 'BEHAVIOR_NOT_IMPORTED', 'Comportement non importe. Le score COM sera incomplet.'));
      }
    }

    var matching = {
      notes: ia_matchNotes_(studentBuild.studentMap, matchIndex, notesResults),
      absences: ia_matchList_(studentBuild.studentMap, matchIndex, absencesList, 'absences'),
      observations: ia_matchList_(studentBuild.studentMap, matchIndex, observationsList, 'observations'),
      punitions: ia_matchList_(studentBuild.studentMap, matchIndex, punitionsList, 'punitions'),
      incidents: ia_matchList_(studentBuild.studentMap, matchIndex, incidentsList, 'incidents')
    };

    issues = issues.concat(ia_issuesFromMatching_(matching));
    issues = issues.concat(ia_issuesFromCoverage_(matching, elevesList.length));

    var scorePreview = ia_buildScoringPreview_(studentBuild.studentMap, matchIndex, notesResults, absencesList, observationsList, punitionsList, incidentsList);
    var writePlan = ia_buildWritePlan_(studentBuild.classeGroups);
    var errors = issues.filter(function(issue) { return issue.severity === 'error'; });

    return {
      success: true,
      ok: errors.length === 0,
      issues: issues,
      summary: {
        students: elevesList.length,
        classes: Object.keys(studentBuild.classeGroups),
        notesClasses: notesResults.length,
        absencesRows: absencesList.length,
        observationsRows: observationsList.length,
        punitionsRows: punitionsList.length,
        incidentsRows: incidentsList.length
      },
      matching: matching,
      scorePreview: scorePreview,
      writePlan: writePlan,
      meta: {
        executionTimeMs: Date.now() - t0,
        matchingMode: 'indexed'
      }
    };
  } catch (e) {
    return ia_error_(e);
  }
}

function ia_commitImport(payload) {
  try {
    payload = payload || {};
    var preflight = ia_buildImportPreflight(payload);

    if (!preflight.success) return preflight;
    if (!preflight.ok && !payload.force) {
      return {
        success: false,
        error: 'Preflight bloque. Corrige les erreurs avant ecriture.',
        preflight: preflight
      };
    }

    var backup = ia_backupWritePlan_(preflight.writePlan);
    if (!backup.success) {
      return {
        success: false,
        error: 'Backup impossible. Ecriture annulee pour eviter de remplacer des onglets sans sauvegarde.',
        backup: backup,
        preflight: preflight
      };
    }

    var state = payload.state || {};
    var compilePayload = {
      eleves: state.eleves,
      notes: state.notes || [],
      absences: state.absences,
      observations: state.observations,
      punitions: state.punitions,
      incidents: state.incidents
    };

    var result = v3_compileImport(compilePayload);
    if (result && result.success) {
      result.backup = backup;
      result.preflight = preflight;
    }
    return result;
  } catch (e) {
    return ia_error_(e);
  }
}

function ia_getImportLockStatus() {
  try {
    if (typeof v3_getImportLockStatus === 'function') {
      return v3_getImportLockStatus();
    }
    return { success: true, locked: false };
  } catch (e) {
    return ia_error_(e);
  }
}

function ia_analyzeStudents_(eleves) {
  var byKey = {};
  var missingSexe = 0;
  var missingLv2 = 0;
  var classes = {};

  eleves.forEach(function(e, index) {
    var key = cleEleve_(e.nom, e.prenom);
    if (!byKey[key]) {
      byKey[key] = { nom: e.nom || '', prenom: e.prenom || '', classes: [], rows: [] };
    }
    var entry = byKey[key];
    if (e.classe && entry.classes.indexOf(e.classe) === -1) entry.classes.push(e.classe);
    entry.rows.push(index + 1);
    if (!e.sexe) missingSexe++;
    if (!e.lv2) missingLv2++;
    if (e.classe) classes[e.classe] = (classes[e.classe] || 0) + 1;
  });

  var duplicates = [];
  Object.keys(byKey).forEach(function(k) {
    if (byKey[k].rows.length > 1) {
      duplicates.push({
        nom: byKey[k].nom,
        prenom: byKey[k].prenom,
        count: byKey[k].rows.length,
        classes: byKey[k].classes,
        rows: byKey[k].rows
      });
    }
  });

  return {
    duplicateKeys: duplicates.map(function(d) { return d.nom + '|' + d.prenom; }),
    duplicates: duplicates,
    missingSexe: missingSexe,
    missingLv2: missingLv2,
    classes: classes
  };
}

function ia_extractStudents_(state) {
  return (state.eleves && state.eleves.eleves) ? state.eleves.eleves : [];
}

function ia_extractNotes_(state) {
  return Array.isArray(state.notes) ? state.notes : [];
}

function ia_extractArray_(container, key) {
  if (!container) return [];
  if (container[key] && Array.isArray(container[key])) return container[key];
  if (Array.isArray(container)) return container;
  return [];
}

function ia_buildStudentMap_(eleves) {
  var studentMap = {};
  var classeGroups = {};
  var issues = [];

  eleves.forEach(function(e, index) {
    var classe = normaliserClasse_(e.classe);
    var key = cleEleve_(e.nom, e.prenom);

    if (!e.nom) {
      issues.push(ia_issue_('error', 'EMPTY_NAME', 'Eleve sans nom ligne import ' + (index + 1), { index: index }));
      return;
    }

    if (studentMap[key]) {
      issues.push(ia_issue_('error', 'DUPLICATE_STUDENT_KEY', 'Doublon NOM/PRENOM: ' + e.nom + ' ' + (e.prenom || ''), {
        studentKey: key
      }));
      return;
    }

    studentMap[key] = {
      nom: e.nom,
      prenom: e.prenom,
      sexe: e.sexe || '',
      classe: classe,
      lv2: e.lv2 || '',
      opt: e.opt || '',
      dispo: e.dispo || '',
      moyennes: {},
      oraux: {},
      dj: 0,
      nj: 0,
      nbObservations: 0,
      nbPunitions: 0,
      nbIncidents: 0,
      nbEncourage: 0
    };

    if (!classe) {
      issues.push(ia_issue_('error', 'EMPTY_CLASS', 'Classe absente pour ' + e.nom + ' ' + (e.prenom || ''), {
        studentKey: key
      }));
    } else {
      if (!classeGroups[classe]) classeGroups[classe] = [];
      classeGroups[classe].push(key);
    }

    if (!e.sexe) {
      issues.push(ia_issue_('warning', 'MISSING_SEXE', 'Sexe non reconnu pour ' + e.nom + ' ' + (e.prenom || ''), {
        studentKey: key
      }));
    }
  });

  return {
    studentMap: studentMap,
    matchIndex: ia_buildMatchIndex_(studentMap),
    classeGroups: classeGroups,
    issues: issues
  };
}

function ia_buildMatchIndex_(studentMap) {
  var index = {
    normalized: Object.create(null),
    fullCompact: Object.create(null),
    fullNorm: Object.create(null),
    nomOnly: Object.create(null),
    nomCounts: Object.create(null)
  };

  for (var key in studentMap) {
    var st = studentMap[key];
    var normNom = normaliserNom_(st.nom);
    var normPrenom = normaliserNom_(st.prenom);
    var normalized = normNom + '|' + normPrenom;
    var compact = (normNom + normPrenom).replace(/\s+/g, '');
    var fullNorm = (normNom + ' ' + normPrenom).trim();

    ia_indexUnique_(index.normalized, normalized, key);
    if (compact.length >= 3) ia_indexUnique_(index.fullCompact, compact, key);
    if (fullNorm.length >= 3) ia_indexUnique_(index.fullNorm, fullNorm, key);

    if (!index.nomCounts[normNom]) index.nomCounts[normNom] = [];
    index.nomCounts[normNom].push(key);
  }

  for (var nom in index.nomCounts) {
    if (index.nomCounts[nom].length === 1) {
      index.nomOnly[nom] = index.nomCounts[nom][0];
    }
  }

  return index;
}

function ia_indexUnique_(map, token, key) {
  if (!token) return;
  if (map[token] === undefined) {
    map[token] = key;
  } else if (map[token] !== key) {
    map[token] = null;
  }
}

function ia_findMatchingStudentFast_(studentMap, matchIndex, nom, prenom) {
  if (!matchIndex) return findMatchingStudent_(studentMap, nom, prenom);

  var cle = cleEleve_(nom, prenom);
  if (studentMap[cle]) return cle;

  var normNom = normaliserNom_(nom);
  var normPrenom = normaliserNom_(prenom);
  var candidate = matchIndex.normalized[normNom + '|' + normPrenom];
  if (candidate) return candidate;

  var srcFull = (normNom + normPrenom).replace(/\s+/g, '');
  if (srcFull.length >= 3) {
    candidate = matchIndex.fullCompact[srcFull];
    if (candidate) return candidate;
  }

  var fullName = (String(nom || '') + (prenom ? ' ' + prenom : '')).trim();
  var fullParts = fullName.split(/\s+/);
  if (fullParts.length >= 2) {
    for (var sp = 1; sp < fullParts.length; sp++) {
      var testNom = normaliserNom_(fullParts.slice(0, sp).join(' '));
      var testPrenom = normaliserNom_(fullParts.slice(sp).join(' '));
      candidate = matchIndex.normalized[testNom + '|' + testPrenom];
      if (candidate) return candidate;
    }
  }

  candidate = matchIndex.nomOnly[normNom];
  if (candidate) return candidate;

  var fullNorm = normaliserNom_(fullName);
  candidate = matchIndex.fullNorm[fullNorm];
  if (candidate) return candidate;

  return null;
}

function ia_matchNotes_(studentMap, matchIndex, notesResults) {
  var total = 0;
  var matched = 0;
  var unmatched = [];
  var perClass = [];

  notesResults.forEach(function(result, index) {
    var notes = result && result.notes ? result.notes : [];
    var classMatched = 0;
    total += notes.length;

    notes.forEach(function(note) {
      var key = ia_findMatchingStudentFast_(studentMap, matchIndex, note.nom, note.prenom);
      if (key) classMatched++;
      else unmatched.push((note.nom || '') + ' ' + (note.prenom || ''));
    });

    matched += classMatched;
    perClass.push({
      label: result.classe || 'Classe ' + (index + 1),
      total: notes.length,
      matched: classMatched,
      unmatched: Math.max(0, notes.length - classMatched),
      subjects: result.headersDetected || [],
      oralDetected: result.oralDetected || []
    });
  });

  return ia_matchReport_('notes', total, matched, unmatched, perClass);
}

function ia_matchList_(studentMap, matchIndex, list, label) {
  var matched = 0;
  var unmatched = [];

  list.forEach(function(item) {
    var key = ia_findMatchingStudentFast_(studentMap, matchIndex, item.nom, item.prenom);
    if (key) matched++;
    else unmatched.push((item.nom || '') + ' ' + (item.prenom || ''));
  });

  return ia_matchReport_(label, list.length, matched, unmatched, []);
}

function ia_matchReport_(label, total, matched, unmatched, perClass) {
  return {
    label: label,
    total: total,
    matched: matched,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 30),
    rate: total > 0 ? Math.round((matched / total) * 1000) / 10 : null,
    perClass: perClass || []
  };
}

function ia_issuesFromCoverage_(matching, studentCount) {
  var issues = [];
  var notes = matching.notes;

  if (notes && notes.total > 0 && studentCount > 0 && notes.matched < studentCount * 0.8) {
    issues.push(ia_issue_(
      'warning',
      'NOTES_PARTIAL_COHORT',
      'Notes probablement partielles : ' + notes.matched + ' ligne(s) de notes rattachee(s) pour ' + studentCount + ' eleve(s) dans la liste. Tu as sans doute importe une seule classe de notes ; ajoute les autres tableaux de notes avant ecriture.',
      {
        matched: notes.matched,
        expectedStudents: studentCount,
        importedTables: notes.perClass ? notes.perClass.length : 0
      }
    ));
  }

  return issues;
}

function ia_issuesFromMatching_(matching) {
  var issues = [];

  Object.keys(matching).forEach(function(key) {
    var report = matching[key];
    if (!report || report.total === 0) return;

    if (report.unmatchedCount > 0) {
      var severity = report.rate < 90 ? 'error' : 'warning';
      issues.push(ia_issue_(severity, 'UNMATCHED_' + key.toUpperCase(), report.unmatchedCount + ' ligne(s) ' + key + ' non rattachee(s) a un eleve (' + report.rate + '% matches)', {
        unmatched: report.unmatched
      }));
    }
  });

  return issues;
}

function ia_buildScoringPreview_(studentMap, matchIndex, notesResults, absencesList, observationsList, punitionsList, incidentsList) {
  var key;
  var cfg = ia_getPreviewScoringCfg_();
  var scorePreview = {
    distributions: {
      COM: ia_emptyScoreDistribution_(),
      TRA: ia_emptyScoreDistribution_(),
      PART: ia_emptyScoreDistribution_(),
      ABS: ia_emptyScoreDistribution_()
    },
    missing: {
      COM: 0,
      TRA: 0,
      PART: 0,
      ABS: 0
    },
    samples: []
  };

  notesResults.forEach(function(result) {
    var notes = result && result.notes ? result.notes : [];
    notes.forEach(function(note) {
      key = ia_findMatchingStudentFast_(studentMap, matchIndex, note.nom, note.prenom);
      if (key) {
        studentMap[key].moyennes = note.moyennes || {};
        studentMap[key].oraux = note.oraux || {};
      }
    });
  });

  absencesList.forEach(function(abs) {
    key = ia_findMatchingStudentFast_(studentMap, matchIndex, abs.nom, abs.prenom);
    if (key) {
      studentMap[key].dj = abs.dj || 0;
      studentMap[key].nj = abs.nj || 0;
    }
  });

  punitionsList.forEach(function(pun) {
    key = ia_findMatchingStudentFast_(studentMap, matchIndex, pun.nom, pun.prenom);
    if (key) studentMap[key].nbPunitions += pun.nb || 0;
  });

  incidentsList.forEach(function(inc) {
    key = ia_findMatchingStudentFast_(studentMap, matchIndex, inc.nom, inc.prenom);
    if (key) studentMap[key].nbIncidents += inc.nb || 0;
  });

  observationsList.forEach(function(obs) {
    key = ia_findMatchingStudentFast_(studentMap, matchIndex, obs.nom, obs.prenom);
    if (key) {
      studentMap[key].nbObservations += obs.nbObservationsNeg || 0;
      studentMap[key].nbEncourage += obs.nbEncourage || 0;
    }
  });

  for (key in studentMap) {
    var st = studentMap[key];
    var scores = {
      COM: ia_calcScoreCOMPreview_(st.nbPunitions, st.nbIncidents, st.nbObservations, st.nbEncourage, cfg),
      TRA: ia_calcScoreTRAPreview_(st.moyennes, cfg),
      PART: ia_calcScorePARTPreview_(st.oraux, cfg),
      ABS: ia_calcScoreABSPreview_(st.dj, st.nj, cfg)
    };

    Object.keys(scores).forEach(function(crit) {
      if (scores[crit] === null || scores[crit] === undefined || scores[crit] === '') {
        scorePreview.missing[crit]++;
      } else {
        scorePreview.distributions[crit][String(scores[crit])] =
          (scorePreview.distributions[crit][String(scores[crit])] || 0) + 1;
      }
    });

    if (scorePreview.samples.length < 20) {
      scorePreview.samples.push({
        nom: st.nom,
        prenom: st.prenom,
        classe: st.classe,
        scores: scores
      });
    }
  }

  return scorePreview;
}

function ia_getPreviewScoringCfg_() {
  if (typeof getImportScoringCfg_ === 'function') return getImportScoringCfg_();
  return {
    seuils: {
      TRA: [
        { score: 4, min: 15, max: 20 },
        { score: 3, min: 12, max: 14.999 },
        { score: 2, min: 8, max: 11.999 },
        { score: 1, min: 0, max: 7.999 }
      ],
      PART: [
        { score: 4, min: 15, max: 20 },
        { score: 3, min: 12, max: 14.999 },
        { score: 2, min: 8, max: 11.999 },
        { score: 1, min: 0, max: 7.999 }
      ],
      COM: [
        { score: 4, min: 0, max: 0 },
        { score: 3, min: 1, max: 5 },
        { score: 2, min: 6, max: 20 },
        { score: 1, min: 21, max: 999 }
      ],
      ABS: {
        DJ: [
          { score: 4, min: 0, max: 5 },
          { score: 3, min: 6, max: 13 },
          { score: 2, min: 14, max: 25 },
          { score: 1, min: 26, max: 999 }
        ],
        NJ: [
          { score: 4, min: 0, max: 0 },
          { score: 3, min: 1, max: 2 },
          { score: 2, min: 3, max: 5 },
          { score: 1, min: 6, max: 999 }
        ],
        poidsDJ: 0.6,
        poidsNJ: 0.4
      }
    }
  };
}

function ia_scoreByThreshold_(value, thresholds) {
  if (value === null || value === undefined || isNaN(value)) return null;
  for (var i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i].min && value <= thresholds[i].max) return thresholds[i].score;
  }
  return null;
}

function ia_calcScoreTRAPreview_(moyennes, cfg) {
  if (!moyennes || Object.keys(moyennes).length === 0) return null;
  var coeffMap = (typeof getImportCoeffMap_ === 'function')
    ? getImportCoeffMap_(typeof detectImportNiveau_ === 'function' ? detectImportNiveau_() : '5e')
    : { FRANC: 4.5, MATH: 3.5, HG: 3.0, ANG: 3.0, LV2: 2.5, EPS: 2.0, PHCH: 1.5, SVT: 1.5, TECH: 1.5, APLA: 1.0, MUS: 1.0, LAT: 1.0 };
  var totalPts = 0;
  var totalCoeff = 0;
  for (var id in moyennes) {
    var note = moyennes[id];
    if (note === null || note === undefined) continue;
    var coeff = coeffMap[id] || 1.0;
    totalPts += note * coeff;
    totalCoeff += coeff;
  }
  if (totalCoeff === 0) return null;
  return ia_scoreByThreshold_(Math.round(totalPts / totalCoeff * 100) / 100, cfg.seuils.TRA);
}

function ia_calcScorePARTPreview_(oraux, cfg) {
  if (!oraux || Object.keys(oraux).length === 0) return null;
  var notes = [];
  for (var id in oraux) {
    if (oraux[id] !== null && oraux[id] !== undefined) notes.push(oraux[id]);
  }
  if (notes.length === 0) return null;
  var moy = notes.reduce(function(a, b) { return a + b; }, 0) / notes.length;
  return ia_scoreByThreshold_(Math.round(moy * 100) / 100, cfg.seuils.PART);
}

function ia_calcScoreABSPreview_(dj, nj, cfg) {
  if (dj === 0 && nj === 0) return 4;
  var seuils = cfg.seuils.ABS;
  var scoreDJ = ia_scoreByThreshold_(dj, seuils.DJ);
  var scoreNJ = ia_scoreByThreshold_(nj, seuils.NJ);
  return Math.ceil(scoreDJ * seuils.poidsDJ + scoreNJ * seuils.poidsNJ);
}

function ia_calcScoreCOMPreview_(nbPunitions, nbIncidents, nbObservations, nbEncourage, cfg) {
  var obsNet = nbObservations || 0;
  if ((nbEncourage || 0) > 0 && obsNet > 0) {
    obsNet = obsNet - Math.min(nbEncourage, Math.floor(obsNet * 0.3));
  }
  var total = (nbPunitions || 0) * 2 + (nbIncidents || 0) * 3 + Math.ceil(obsNet * 0.5);
  return ia_scoreByThreshold_(total, cfg.seuils.COM);
}

function ia_emptyScoreDistribution_() {
  return { '1': 0, '2': 0, '3': 0, '4': 0 };
}

function ia_buildWritePlan_(classeGroups) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var classes = [];

  Object.keys(classeGroups).forEach(function(classe) {
    var sheet = ss.getSheetByName(classe);
    classes.push({
      name: classe,
      students: classeGroups[classe].length,
      exists: !!sheet,
      currentRows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
      action: sheet ? 'replace' : 'create'
    });
  });

  return {
    classes: classes,
    willReplace: classes.filter(function(c) { return c.action === 'replace'; }).length,
    willCreate: classes.filter(function(c) { return c.action === 'create'; }).length
  };
}

function ia_backupWritePlan_(writePlan) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var copied = [];
  var failed = false;

  if (!writePlan || !writePlan.classes) return { success: true, copied: copied };

  writePlan.classes.forEach(function(item) {
    if (!item.exists) return;
    var sheet = ss.getSheetByName(item.name);
    if (!sheet || sheet.getLastRow() <= 1) return;

    try {
      var backupName = ia_uniqueSheetName_(ss, '_BK_IMPORT_' + stamp + '_' + item.name);
      sheet.copyTo(ss).setName(backupName);
      copied.push({ source: item.name, backup: backupName });
    } catch (e) {
      failed = true;
      copied.push({ source: item.name, error: e.toString() });
    }
  });

  return { success: !failed, copied: copied };
}

function ia_uniqueSheetName_(ss, wanted) {
  var base = String(wanted).substring(0, 90);
  var name = base;
  var i = 1;
  while (ss.getSheetByName(name)) {
    name = String(base).substring(0, 86) + '_' + i;
    i++;
  }
  return name;
}

function ia_issue_(severity, code, message, details) {
  return {
    severity: severity,
    code: code,
    message: message,
    details: details || {}
  };
}

function ia_error_(e) {
  Logger.log('ImportAssistant error: ' + e.toString());
  if (e.stack) Logger.log(e.stack);
  return {
    success: false,
    error: e.message || e.toString()
  };
}
