/**
 * ===================================================================
 * SCOREENGINE_V1 - Juge commun des repartitions
 * ===================================================================
 *
 * Contrat:
 * - ne modifie jamais la repartition recue;
 * - ne propose aucun swap;
 * - valide d'abord les contraintes dures;
 * - si la repartition est valide, calcule un score de penalite explique.
 *
 * Le score est une penalite: 0 est ideal, plus haut est moins bon.
 * Les violations dures annulent le score.
 *
 * @version 1.0.0
 */

var ScoreEngineV1 = (function () {
  var ENGINE_VERSION = '1.0.0';

  var LEVEL_BANDS = [
    'tres_fort',
    'fort',
    'moyen',
    'fragile',
    'tres_fragile'
  ];

  var DEFAULT_WEIGHTS = {
    effectifs: 20,
    levelBands: 50,
    levelAverage: 10,
    gender: 8,
    profilSensible: 80
  };

  var DEFAULT_OPTIONS = {
    weightsProfile: 'default',
    normalizationBasePerStudent: 5,
    alertThresholds: {
      levelBandCountDelta: 1.5,
      levelAverageDelta: 0.5,
      genderCountDelta: 1.5,
      profilSensibleExcess: 1
    }
  };

  /**
   * Evalue une repartition de classes.
   *
   * @param {Object} input
   * @returns {Object}
   */
  function evaluateDistribution(input) {
    var t0 = now();
    var normalizedInput = normalizeInput(input);
    var ctx = buildContext(normalizedInput);
    var hardViolations = checkHardConstraints(ctx);

    if (hardViolations.length > 0) {
      return {
        valid: false,
        scoreTotal: null,
        scoreNormalized: null,
        hardViolations: hardViolations,
        softPenalties: emptySoftPenalties(),
        classReports: {},
        blockers: buildBlockersFromHardViolations(hardViolations),
        meta: buildMeta(ctx, t0)
      };
    }

    computeCohortMetrics(ctx);
    computeClassMetrics(ctx);

    var softResult = computeSoftPenalties(ctx);
    var softPenalties = softResult.softPenalties;
    var classReports = softResult.classReports;
    var scoreTotal = round(sumValues(softPenalties), 2);

    return {
      valid: true,
      scoreTotal: scoreTotal,
      scoreNormalized: normalizeScore(scoreTotal, ctx),
      hardViolations: [],
      softPenalties: softPenalties,
      classReports: classReports,
      blockers: [],
      meta: buildMeta(ctx, t0)
    };
  }

  function normalizeInput(input) {
    input = input || {};

    var options = mergeOptions(DEFAULT_OPTIONS, input.options || {});

    return {
      students: normalizeStudents(input.students),
      classes: normalizeClasses(input.classes),
      assignment: normalizeAssignment(input.assignment),
      constraints: normalizeConstraints(input.constraints),
      weights: mergeObjects(DEFAULT_WEIGHTS, input.weights || {}),
      options: options
    };
  }

  function normalizeStudents(students) {
    if (!Array.isArray(students)) return [];

    return students.map(function (student) {
      student = student || {};

      return {
        id: toTrimmedString_(student.id),
        nom: toTrimmedString_(student.nom),
        prenom: toTrimmedString_(student.prenom),
        gender: normalizeGender(student.gender),
        levelScore: toFiniteNumberOrNull(student.levelScore),
        levelBand: toTrimmedString_(student.levelBand),
        options: normalizeStringArray(student.options),
        lv2: toTrimmedString_(student.lv2),
        flags: {
          profilSensible: student.flags && student.flags.profilSensible === true,
          besoinParticulier: student.flags && student.flags.besoinParticulier === true
        },
        lockedClass: toTrimmedString_(student.lockedClass),
        forbiddenClasses: normalizeStringArray(student.forbiddenClasses),
        raw: student
      };
    });
  }

  function normalizeClasses(classes) {
    if (!Array.isArray(classes)) return [];

    return classes.map(function (classe) {
      classe = classe || {};

      return {
        id: toTrimmedString_(classe.id),
        label: toTrimmedString_(classe.label) || toTrimmedString_(classe.id),
        targetSize: toFiniteNumberOrNull(classe.targetSize),
        minSize: toFiniteNumberOrNull(classe.minSize),
        maxSize: toFiniteNumberOrNull(classe.maxSize),
        allowedOptions: normalizeAllowedList(classe.allowedOptions),
        allowedLv2: normalizeAllowedList(classe.allowedLv2),
        raw: classe
      };
    });
  }

  function normalizeAssignment(assignment) {
    var normalized = {};
    assignment = assignment || {};

    Object.keys(assignment).forEach(function (studentId) {
      var id = toTrimmedString_(studentId);
      normalized[id] = toTrimmedString_(assignment[studentId]);
    });

    return normalized;
  }

  function normalizeConstraints(constraints) {
    constraints = constraints || {};

    return {
      asso: normalizeConstraintGroups(constraints.asso),
      disso: normalizeConstraintGroups(constraints.disso)
    };
  }

  function normalizeConstraintGroups(groups) {
    if (!Array.isArray(groups)) return [];

    return groups.map(function (group) {
      if (!Array.isArray(group)) return [];
      return group.map(toTrimmedString_).filter(Boolean);
    });
  }

  function buildContext(input) {
    var studentsById = new Map();
    var classesById = new Map();
    var classStudents = new Map();
    var duplicateStudentIds = [];
    var duplicateClassIds = [];

    input.students.forEach(function (student) {
      if (!student.id) return;

      if (studentsById.has(student.id)) {
        duplicateStudentIds.push(student.id);
        return;
      }

      studentsById.set(student.id, student);
    });

    input.classes.forEach(function (classe) {
      if (!classe.id) return;

      if (classesById.has(classe.id)) {
        duplicateClassIds.push(classe.id);
        return;
      }

      classesById.set(classe.id, classe);
      classStudents.set(classe.id, []);
    });

    input.students.forEach(function (student) {
      if (!student.id) return;

      var classId = input.assignment[student.id];
      if (classId && classStudents.has(classId)) {
        classStudents.get(classId).push(student);
      }
    });

    return {
      students: input.students,
      classes: input.classes,
      assignment: input.assignment,
      constraints: input.constraints,
      weights: input.weights,
      options: input.options,
      studentsById: studentsById,
      classesById: classesById,
      classStudents: classStudents,
      duplicateStudentIds: duplicateStudentIds,
      duplicateClassIds: duplicateClassIds,
      cohortMetrics: null,
      classMetrics: {}
    };
  }

  function checkHardConstraints(ctx) {
    var violations = [];

    function add(code, message, data) {
      data = data || {};
      violations.push({
        code: code,
        message: message,
        studentIds: data.studentIds || [],
        classIds: data.classIds || [],
        details: data.details || {}
      });
    }

    checkStudentIds(ctx, add);
    checkClassIds(ctx, add);
    checkAssignments(ctx, add);
    checkClassSizes(ctx, add);
    checkStudentCompatibility(ctx, add);
    checkAsso(ctx, add);
    checkDisso(ctx, add);
    checkLevelBands(ctx, add);

    return violations;
  }

  function checkStudentIds(ctx, add) {
    var seen = new Map();

    ctx.students.forEach(function (student, index) {
      var id = student.id;

      if (!id) {
        add('EMPTY_STUDENT_ID', 'Identifiant eleve vide', {
          details: { index: index }
        });
        return;
      }

      if (seen.has(id)) {
        add('DUPLICATE_STUDENT_ID', 'Identifiant eleve duplique: ' + id, {
          studentIds: [id],
          details: {
            firstIndex: seen.get(id),
            duplicateIndex: index
          }
        });
      } else {
        seen.set(id, index);
      }
    });
  }

  function checkClassIds(ctx, add) {
    var seen = new Map();

    ctx.classes.forEach(function (classe, index) {
      var id = classe.id;

      if (!id) {
        add('EMPTY_CLASS_ID', 'Identifiant classe vide', {
          details: { index: index }
        });
        return;
      }

      if (seen.has(id)) {
        add('DUPLICATE_CLASS_ID', 'Identifiant classe duplique: ' + id, {
          classIds: [id],
          details: {
            firstIndex: seen.get(id),
            duplicateIndex: index
          }
        });
      } else {
        seen.set(id, index);
      }
    });
  }

  function checkAssignments(ctx, add) {
    Object.keys(ctx.assignment).forEach(function (assignedId) {
      if (assignedId && !ctx.studentsById.has(assignedId)) {
        add('UNKNOWN_STUDENT_IN_ASSIGNMENT', 'Affectation pour un eleve inconnu: ' + assignedId, {
          studentIds: [assignedId]
        });
      }
    });

    ctx.students.forEach(function (student) {
      if (!student.id) return;

      var classId = ctx.assignment[student.id];

      if (!classId) {
        add('UNASSIGNED_STUDENT', 'Eleve sans affectation', {
          studentIds: [student.id]
        });
        return;
      }

      if (!ctx.classesById.has(classId)) {
        add('UNKNOWN_CLASS_ASSIGNMENT', 'Eleve affecte a une classe inexistante: ' + classId, {
          studentIds: [student.id],
          classIds: [classId]
        });
      }
    });
  }

  function checkClassSizes(ctx, add) {
    ctx.classes.forEach(function (classe) {
      if (!classe.id) return;

      var students = ctx.classStudents.get(classe.id) || [];
      var size = students.length;

      if (classe.minSize !== null && size < classe.minSize) {
        add('CLASS_UNDER_MIN_SIZE', 'Classe sous effectif minimum: ' + classe.id, {
          classIds: [classe.id],
          details: {
            size: size,
            minSize: classe.minSize
          }
        });
      }

      if (classe.maxSize !== null && size > classe.maxSize) {
        add('CLASS_OVER_MAX_SIZE', 'Classe au-dessus de l effectif maximum: ' + classe.id, {
          classIds: [classe.id],
          details: {
            size: size,
            maxSize: classe.maxSize
          }
        });
      }
    });
  }

  function checkStudentCompatibility(ctx, add) {
    ctx.students.forEach(function (student) {
      if (!student.id) return;

      var classId = ctx.assignment[student.id];
      var classe = ctx.classesById.get(classId);

      if (!classe) return;

      if (student.lockedClass && student.lockedClass !== classId) {
        add('LOCKED_CLASS_VIOLATION', 'Eleve verrouille dans une autre classe', {
          studentIds: [student.id],
          classIds: [classId, student.lockedClass],
          details: {
            assignedClass: classId,
            lockedClass: student.lockedClass
          }
        });
      }

      if (student.forbiddenClasses.indexOf(classId) !== -1) {
        add('FORBIDDEN_CLASS_VIOLATION', 'Eleve affecte dans une classe interdite', {
          studentIds: [student.id],
          classIds: [classId]
        });
      }

      student.options.forEach(function (option) {
        if (!isAllowed(option, classe.allowedOptions)) {
          add('INCOMPATIBLE_OPTION', 'Option incompatible avec la classe', {
            studentIds: [student.id],
            classIds: [classId],
            details: {
              option: option,
              allowedOptions: classe.allowedOptions || []
            }
          });
        }
      });

      if (student.lv2 && !isAllowed(student.lv2, classe.allowedLv2)) {
        add('INCOMPATIBLE_LV2', 'LV2 incompatible avec la classe', {
          studentIds: [student.id],
          classIds: [classId],
          details: {
            lv2: student.lv2,
            allowedLv2: classe.allowedLv2 || []
          }
        });
      }
    });
  }

  function checkAsso(ctx, add) {
    ctx.constraints.asso.forEach(function (group) {
      var classIds = new Set();
      var studentIds = [];

      group.forEach(function (studentId) {
        studentIds.push(studentId);

        if (!ctx.studentsById.has(studentId)) {
          add('UNKNOWN_STUDENT_IN_CONSTRAINT', 'Eleve inconnu dans une contrainte ASSO: ' + studentId, {
            studentIds: [studentId]
          });
          return;
        }

        var classId = ctx.assignment[studentId];
        if (classId) classIds.add(classId);
      });

      if (classIds.size > 1) {
        add('ASSO_NOT_RESPECTED', 'Contrainte ASSO non respectee', {
          studentIds: studentIds,
          classIds: Array.from(classIds)
        });
      }
    });
  }

  function checkDisso(ctx, add) {
    ctx.constraints.disso.forEach(function (group) {
      var ids = group || [];

      ids.forEach(function (studentId) {
        if (!ctx.studentsById.has(studentId)) {
          add('UNKNOWN_STUDENT_IN_CONSTRAINT', 'Eleve inconnu dans une contrainte DISSO: ' + studentId, {
            studentIds: [studentId]
          });
        }
      });

      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
          var idA = ids[i];
          var idB = ids[j];
          var classA = ctx.assignment[idA];
          var classB = ctx.assignment[idB];

          if (classA && classA === classB) {
            add('DISSO_NOT_RESPECTED', 'Contrainte DISSO non respectee', {
              studentIds: [idA, idB],
              classIds: [classA]
            });
          }
        }
      }
    });
  }

  function checkLevelBands(ctx, add) {
    ctx.students.forEach(function (student) {
      if (!student.id) return;

      if (LEVEL_BANDS.indexOf(student.levelBand) === -1) {
        add('INVALID_LEVEL_BAND', 'Tranche de niveau invalide ou manquante', {
          studentIds: [student.id],
          details: {
            levelBand: student.levelBand
          }
        });
      }
    });
  }

  function computeCohortMetrics(ctx) {
    var students = ctx.students;
    var n = students.length;
    var bands = emptyBands();
    var levelSum = 0;
    var levelCount = 0;
    var femaleCount = 0;
    var genderKnownCount = 0;
    var profilSensibleCount = 0;

    students.forEach(function (student) {
      bands[student.levelBand]++;

      if (student.levelScore !== null) {
        levelSum += student.levelScore;
        levelCount++;
      }

      if (student.gender === 'F' || student.gender === 'M') {
        genderKnownCount++;
        if (student.gender === 'F') femaleCount++;
      }

      if (student.flags.profilSensible === true) {
        profilSensibleCount++;
      }
    });

    var bandRatios = {};
    LEVEL_BANDS.forEach(function (band) {
      bandRatios[band] = n > 0 ? bands[band] / n : 0;
    });

    ctx.cohortMetrics = {
      size: n,
      averageLevel: levelCount > 0 ? levelSum / levelCount : null,
      bands: bands,
      bandRatios: bandRatios,
      femaleCount: femaleCount,
      genderKnownCount: genderKnownCount,
      femaleRatio: genderKnownCount > 0 ? femaleCount / genderKnownCount : null,
      profilSensibleCount: profilSensibleCount,
      profilSensibleRatio: n > 0 ? profilSensibleCount / n : 0
    };
  }

  function computeClassMetrics(ctx) {
    ctx.classes.forEach(function (classe) {
      var students = ctx.classStudents.get(classe.id) || [];
      var bands = emptyBands();
      var levelSum = 0;
      var levelCount = 0;
      var femaleCount = 0;
      var genderKnownCount = 0;
      var profilSensibleCount = 0;

      students.forEach(function (student) {
        bands[student.levelBand]++;

        if (student.levelScore !== null) {
          levelSum += student.levelScore;
          levelCount++;
        }

        if (student.gender === 'F' || student.gender === 'M') {
          genderKnownCount++;
          if (student.gender === 'F') femaleCount++;
        }

        if (student.flags.profilSensible === true) {
          profilSensibleCount++;
        }
      });

      ctx.classMetrics[classe.id] = {
        size: students.length,
        targetSize: classe.targetSize,
        minSize: classe.minSize,
        maxSize: classe.maxSize,
        averageLevel: levelCount > 0 ? levelSum / levelCount : null,
        genderRatioF: genderKnownCount > 0 ? femaleCount / genderKnownCount : null,
        femaleCount: femaleCount,
        genderKnownCount: genderKnownCount,
        bands: bands,
        profilSensibleCount: profilSensibleCount
      };
    });
  }

  function computeSoftPenalties(ctx) {
    var softPenalties = emptySoftPenalties();
    var classReports = {};

    ctx.classes.forEach(function (classe) {
      var classId = classe.id;
      var metrics = ctx.classMetrics[classId];

      classReports[classId] = {
        score: 0,
        topPenaltyCriterion: null,
        topPenaltyReason: null,
        topPenalty: 0,
        alerts: [],
        metrics: {
          size: metrics.size,
          targetSize: metrics.targetSize,
          averageLevel: roundOrNull(metrics.averageLevel, 2),
          genderRatioF: roundOrNull(metrics.genderRatioF, 2),
          bands: cloneObject(metrics.bands),
          profilSensibleCount: metrics.profilSensibleCount
        },
        penaltyBreakdown: []
      };

      computeEffectifPenalty(ctx, classe, metrics, softPenalties, classReports);
      computeLevelBandsPenalty(ctx, classe, metrics, softPenalties, classReports);
      computeLevelAveragePenalty(ctx, classe, metrics, softPenalties, classReports);
      computeGenderPenalty(ctx, classe, metrics, softPenalties, classReports);
      computeProfilSensiblePenalty(ctx, classe, metrics, softPenalties, classReports);

      finalizeClassReport(classReports[classId]);
    });

    Object.keys(softPenalties).forEach(function (key) {
      softPenalties[key] = round(softPenalties[key], 2);
    });

    return {
      softPenalties: softPenalties,
      classReports: classReports
    };
  }

  function computeEffectifPenalty(ctx, classe, metrics, softPenalties, classReports) {
    if (classe.targetSize === null) return;

    var delta = metrics.size - classe.targetSize;
    var penalty = Math.abs(delta) * ctx.weights.effectifs;

    if (penalty <= 0) return;

    addSoftPenalty({
      classId: classe.id,
      criterion: 'effectifs',
      penalty: penalty,
      softPenalties: softPenalties,
      classReports: classReports,
      message: 'Effectif ' + metrics.size + ', cible ' + classe.targetSize + ' (' + formatSigned(delta) + ')',
      details: {
        size: metrics.size,
        targetSize: classe.targetSize,
        delta: delta
      }
    });
  }

  function computeLevelBandsPenalty(ctx, classe, metrics, softPenalties, classReports) {
    var sumAbsDelta = 0;
    var details = [];

    LEVEL_BANDS.forEach(function (band) {
      var actual = metrics.bands[band];
      var expected = metrics.size * ctx.cohortMetrics.bandRatios[band];
      var delta = actual - expected;

      sumAbsDelta += Math.abs(delta);

      details.push({
        band: band,
        actual: actual,
        expected: round(expected, 2),
        delta: round(delta, 2)
      });

      if (Math.abs(delta) >= ctx.options.alertThresholds.levelBandCountDelta) {
        classReports[classe.id].alerts.push(
          labelBand(band) + ': ' + actual + ' vs cible ' + round(expected, 1) + ' (' + formatSigned(round(delta, 1)) + ')'
        );
      }
    });

    var units = sumAbsDelta / 2;
    var penalty = units * ctx.weights.levelBands;

    if (penalty <= 0) return;

    addSoftPenalty({
      classId: classe.id,
      criterion: 'levelBands',
      penalty: penalty,
      softPenalties: softPenalties,
      classReports: classReports,
      message: 'Repartition des tranches de niveau eloignee de la cohorte',
      details: {
        units: round(units, 2),
        bands: details
      }
    });
  }

  function computeLevelAveragePenalty(ctx, classe, metrics, softPenalties, classReports) {
    var cohortAverage = ctx.cohortMetrics.averageLevel;
    var classAverage = metrics.averageLevel;

    if (cohortAverage === null || classAverage === null) return;

    var delta = classAverage - cohortAverage;
    var penalty = Math.abs(delta) * ctx.weights.levelAverage;

    if (penalty <= 0) return;

    if (Math.abs(delta) >= ctx.options.alertThresholds.levelAverageDelta) {
      classReports[classe.id].alerts.push(
        'Moyenne ' + round(classAverage, 2) + ' vs cohorte ' + round(cohortAverage, 2) + ' (' + formatSigned(round(delta, 2)) + ')'
      );
    }

    addSoftPenalty({
      classId: classe.id,
      criterion: 'levelAverage',
      penalty: penalty,
      softPenalties: softPenalties,
      classReports: classReports,
      message: 'Moyenne scolaire eloignee de la cohorte',
      details: {
        classAverage: round(classAverage, 2),
        cohortAverage: round(cohortAverage, 2),
        delta: round(delta, 2)
      }
    });
  }

  function computeGenderPenalty(ctx, classe, metrics, softPenalties, classReports) {
    var cohortFemaleRatio = ctx.cohortMetrics.femaleRatio;

    if (cohortFemaleRatio === null || metrics.genderKnownCount === 0) return;

    var expectedF = metrics.genderKnownCount * cohortFemaleRatio;
    var deltaF = metrics.femaleCount - expectedF;
    var penalty = Math.abs(deltaF) * ctx.weights.gender;

    if (penalty <= 0) return;

    if (Math.abs(deltaF) >= ctx.options.alertThresholds.genderCountDelta) {
      classReports[classe.id].alerts.push(
        'Parite: ' + metrics.femaleCount + ' filles vs cible ' + round(expectedF, 1) + ' (' + formatSigned(round(deltaF, 1)) + ')'
      );
    }

    addSoftPenalty({
      classId: classe.id,
      criterion: 'gender',
      penalty: penalty,
      softPenalties: softPenalties,
      classReports: classReports,
      message: 'Repartition filles/garcons eloignee de la cohorte',
      details: {
        femaleCount: metrics.femaleCount,
        expectedF: round(expectedF, 2),
        deltaF: round(deltaF, 2)
      }
    });
  }

  function computeProfilSensiblePenalty(ctx, classe, metrics, softPenalties, classReports) {
    var expected = metrics.size * ctx.cohortMetrics.profilSensibleRatio;
    var excess = Math.max(0, metrics.profilSensibleCount - expected);
    var penalty = excess * excess * ctx.weights.profilSensible;

    if (penalty <= 0) return;

    if (excess >= ctx.options.alertThresholds.profilSensibleExcess) {
      classReports[classe.id].alerts.push(
        'Concentration de profils sensibles: ' + metrics.profilSensibleCount + ' vs cible ' + round(expected, 1) + ' (+' + round(excess, 1) + ')'
      );
    }

    addSoftPenalty({
      classId: classe.id,
      criterion: 'profilSensible',
      penalty: penalty,
      softPenalties: softPenalties,
      classReports: classReports,
      message: 'Concentration de profils sensibles',
      details: {
        actual: metrics.profilSensibleCount,
        expected: round(expected, 2),
        excess: round(excess, 2)
      }
    });
  }

  function addSoftPenalty(params) {
    var roundedPenalty = round(params.penalty, 2);

    params.softPenalties[params.criterion] += roundedPenalty;
    params.classReports[params.classId].score += roundedPenalty;
    params.classReports[params.classId].penaltyBreakdown.push({
      criterion: params.criterion,
      penalty: roundedPenalty,
      message: params.message,
      details: params.details
    });
  }

  function finalizeClassReport(report) {
    var breakdown = report.penaltyBreakdown.slice().sort(function (a, b) {
      return b.penalty - a.penalty;
    });

    report.score = round(report.score, 2);

    if (breakdown.length > 0) {
      report.topPenaltyCriterion = breakdown[0].criterion;
      report.topPenaltyReason = breakdown[0].message;
      report.topPenalty = breakdown[0].penalty;
    }
  }

  function normalizeScore(scoreTotal, ctx) {
    var base = Math.max(1, ctx.students.length) * ctx.options.normalizationBasePerStudent;

    if (scoreTotal <= 0) return 0;
    return round(scoreTotal / (scoreTotal + base), 4);
  }

  function buildMeta(ctx, t0) {
    return {
      engineVersion: ENGINE_VERSION,
      weightsProfile: ctx.options.weightsProfile || 'custom',
      timestamp: new Date().toISOString(),
      executionTimeMs: round(now() - t0, 2)
    };
  }

  function buildBlockersFromHardViolations(hardViolations) {
    return hardViolations.map(function (violation) {
      return {
        code: violation.code,
        studentIds: violation.studentIds,
        classIds: violation.classIds,
        details: violation.details
      };
    });
  }

  function emptySoftPenalties() {
    return {
      effectifs: 0,
      levelBands: 0,
      levelAverage: 0,
      gender: 0,
      profilSensible: 0
    };
  }

  function emptyBands() {
    return {
      tres_fort: 0,
      fort: 0,
      moyen: 0,
      fragile: 0,
      tres_fragile: 0
    };
  }

  function isAllowed(value, allowedValues) {
    if (!value) return true;

    // null ou undefined signifie: pas de restriction declaree.
    if (allowedValues === null || allowedValues === undefined) return true;

    // tableau vide signifie: rien n'est autorise.
    if (Array.isArray(allowedValues)) {
      return allowedValues.indexOf(value) !== -1;
    }

    return false;
  }

  function normalizeAllowedList(value) {
    if (value === null || value === undefined) return null;
    return normalizeStringArray(value);
  }

  function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];

    return value
      .map(toTrimmedString_)
      .filter(function (item) {
        return item !== '';
      });
  }

  function normalizeGender(value) {
    var gender = toTrimmedString_(value).toUpperCase();
    if (gender === 'F' || gender === 'M') return gender;
    return '';
  }

  function labelBand(band) {
    var labels = {
      tres_fort: 'Tres forts',
      fort: 'Forts',
      moyen: 'Moyens',
      fragile: 'Fragiles',
      tres_fragile: 'Tres fragiles'
    };

    return labels[band] || band;
  }

  function formatSigned(value) {
    return value >= 0 ? '+' + value : String(value);
  }

  function round(value, decimals) {
    decimals = decimals === undefined ? 2 : decimals;

    var factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function roundOrNull(value, decimals) {
    if (value === null || value === undefined) return null;
    return round(value, decimals);
  }

  function toTrimmedString_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function toFiniteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;

    var numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function mergeObjects(defaults, overrides) {
    var merged = cloneObject(defaults);

    Object.keys(overrides || {}).forEach(function (key) {
      if (overrides[key] !== undefined && overrides[key] !== null) {
        merged[key] = overrides[key];
      }
    });

    return merged;
  }

  function mergeOptions(defaults, overrides) {
    var merged = mergeObjects(defaults, overrides);
    merged.alertThresholds = mergeObjects(
      defaults.alertThresholds || {},
      (overrides && overrides.alertThresholds) || {}
    );
    return merged;
  }

  function cloneObject(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function sumValues(obj) {
    return Object.keys(obj).reduce(function (sum, key) {
      return sum + (Number(obj[key]) || 0);
    }, 0);
  }

  function now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }

    return Date.now();
  }

  return {
    evaluateDistribution: evaluateDistribution,
    normalizeInput: normalizeInput,
    buildContext: buildContext,
    checkHardConstraints: checkHardConstraints,
    computeCohortMetrics: computeCohortMetrics,
    computeClassMetrics: computeClassMetrics,
    computeSoftPenalties: computeSoftPenalties,
    normalizeScore: normalizeScore,
    LEVEL_BANDS: LEVEL_BANDS,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScoreEngineV1;
}
