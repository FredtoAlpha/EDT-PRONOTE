/**
 * Tests unitaires legers pour ScoreEngine_V1.
 *
 * Dans Apps Script: executer runScoreEngineV1Tests().
 * En local Node: node ScoreEngine_V1_Tests.js
 */

function runScoreEngineV1Tests() {
  var engine = getScoreEngineV1ForTests_();
  var tests = [
    testScoreEngineV1ValidDistribution_,
    testScoreEngineV1UnassignedStudent_,
    testScoreEngineV1UnknownClass_,
    testScoreEngineV1AssoBroken_,
    testScoreEngineV1DissoBroken_,
    testScoreEngineV1IncompatibleOption_,
    testScoreEngineV1LevelBandsPenalty_,
    testScoreEngineV1DuplicateIds_
  ];
  var results = [];

  tests.forEach(function (testFn) {
    try {
      testFn(engine);
      results.push({ name: testFn.name, ok: true });
    } catch (err) {
      results.push({
        name: testFn.name,
        ok: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  });

  var failures = results.filter(function (result) {
    return !result.ok;
  });

  logScoreEngineV1TestResults_(results);

  if (failures.length > 0) {
    throw new Error(failures.length + ' test(s) ScoreEngine_V1 en echec');
  }

  return {
    ok: true,
    total: results.length,
    failures: 0,
    results: results
  };
}

function testScoreEngineV1ValidDistribution_(engine) {
  var result = engine.evaluateDistribution(buildBalancedFixture_());

  assertScoreEngine_(result.valid === true, 'La repartition devrait etre valide');
  assertScoreEngine_(result.hardViolations.length === 0, 'Aucune violation dure attendue');
  assertScoreEngine_(result.scoreTotal !== null, 'Un score doit etre calcule');
}

function testScoreEngineV1UnassignedStudent_(engine) {
  var fixture = buildBalancedFixture_();
  delete fixture.assignment.E1;

  var result = engine.evaluateDistribution(fixture);

  assertHardViolation_(result, 'UNASSIGNED_STUDENT');
  assertScoreEngine_(result.scoreTotal === null, 'Le score doit etre annule');
}

function testScoreEngineV1UnknownClass_(engine) {
  var fixture = buildBalancedFixture_();
  fixture.assignment.E1 = '6Z';

  var result = engine.evaluateDistribution(fixture);

  assertHardViolation_(result, 'UNKNOWN_CLASS_ASSIGNMENT');
}

function testScoreEngineV1AssoBroken_(engine) {
  var fixture = buildBalancedFixture_();
  fixture.constraints.asso = [['E1', 'E4']];

  var result = engine.evaluateDistribution(fixture);

  assertHardViolation_(result, 'ASSO_NOT_RESPECTED');
}

function testScoreEngineV1DissoBroken_(engine) {
  var fixture = buildBalancedFixture_();
  fixture.constraints.disso = [['E1', 'E2']];

  var result = engine.evaluateDistribution(fixture);

  assertHardViolation_(result, 'DISSO_NOT_RESPECTED');
}

function testScoreEngineV1IncompatibleOption_(engine) {
  var fixture = buildBalancedFixture_();
  fixture.classes[0].allowedOptions = [];

  var result = engine.evaluateDistribution(fixture);

  assertHardViolation_(result, 'INCOMPATIBLE_OPTION');
}

function testScoreEngineV1LevelBandsPenalty_(engine) {
  var fixture = buildBalancedFixture_();
  fixture.assignment = {
    E1: '6A',
    E2: '6A',
    E3: '6B',
    E4: '6A',
    E5: '6B',
    E6: '6B'
  };
  fixture.classes[0].targetSize = 3;
  fixture.classes[1].targetSize = 3;
  fixture.classes[0].minSize = 0;
  fixture.classes[0].maxSize = 10;
  fixture.classes[1].minSize = 0;
  fixture.classes[1].maxSize = 10;
  fixture.options.alertThresholds.levelBandCountDelta = 1;

  var result = engine.evaluateDistribution(fixture);

  assertScoreEngine_(result.valid === true, 'La repartition doit rester valide');
  assertScoreEngine_(result.softPenalties.levelBands > 0, 'Une penalite de tranches est attendue');
  assertScoreEngine_(
    result.classReports['6B'].alerts.join(' ').indexOf('Tres fragiles') !== -1,
    'Le rapport doit signaler les tres fragiles'
  );
}

function testScoreEngineV1DuplicateIds_(engine) {
  var fixture = buildBalancedFixture_();
  fixture.students[1].id = 'E1';

  var result = engine.evaluateDistribution(fixture);

  assertHardViolation_(result, 'DUPLICATE_STUDENT_ID');
}

function buildBalancedFixture_() {
  return {
    students: [
      makeStudent_('E1', 'F', 18, 'tres_fort', ['LATIN'], 'ESP', false),
      makeStudent_('E2', 'M', 13, 'moyen', [], 'ESP', false),
      makeStudent_('E3', 'F', 7, 'tres_fragile', [], 'ESP', true),
      makeStudent_('E4', 'M', 17, 'tres_fort', ['LATIN'], 'ESP', false),
      makeStudent_('E5', 'F', 12, 'moyen', [], 'ESP', false),
      makeStudent_('E6', 'M', 6, 'tres_fragile', [], 'ESP', true)
    ],
    classes: [
      {
        id: '6A',
        label: '6A',
        targetSize: 3,
        minSize: 3,
        maxSize: 3,
        allowedOptions: ['LATIN'],
        allowedLv2: ['ESP']
      },
      {
        id: '6B',
        label: '6B',
        targetSize: 3,
        minSize: 3,
        maxSize: 3,
        allowedOptions: ['LATIN'],
        allowedLv2: ['ESP']
      }
    ],
    assignment: {
      E1: '6A',
      E2: '6A',
      E3: '6A',
      E4: '6B',
      E5: '6B',
      E6: '6B'
    },
    constraints: {
      asso: [],
      disso: []
    },
    weights: {
      effectifs: 20,
      levelBands: 50,
      levelAverage: 10,
      gender: 8,
      profilSensible: 80
    },
    options: {
      weightsProfile: 'test',
      normalizationBasePerStudent: 5,
      alertThresholds: {
        levelBandCountDelta: 1.5,
        levelAverageDelta: 0.5,
        genderCountDelta: 1.5,
        profilSensibleExcess: 1
      }
    }
  };
}

function makeStudent_(id, gender, levelScore, levelBand, options, lv2, profilSensible) {
  return {
    id: id,
    nom: 'NOM_' + id,
    prenom: 'Prenom_' + id,
    gender: gender,
    levelScore: levelScore,
    levelBand: levelBand,
    options: options,
    lv2: lv2,
    flags: {
      profilSensible: profilSensible,
      besoinParticulier: false
    },
    lockedClass: null,
    forbiddenClasses: []
  };
}

function assertHardViolation_(result, code) {
  assertScoreEngine_(result.valid === false, 'La repartition devrait etre invalide');
  assertScoreEngine_(result.scoreTotal === null, 'Le score doit etre null');
  assertScoreEngine_(
    result.hardViolations.some(function (violation) {
      return violation.code === code;
    }),
    'Violation attendue absente: ' + code + '. Codes recus: ' + result.hardViolations.map(function (v) { return v.code; }).join(', ')
  );
}

function assertScoreEngine_(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getScoreEngineV1ForTests_() {
  if (typeof ScoreEngineV1 !== 'undefined') {
    return ScoreEngineV1;
  }

  if (typeof require !== 'undefined') {
    return require('./ScoreEngine_V1.js');
  }

  throw new Error('ScoreEngineV1 introuvable');
}

function logScoreEngineV1TestResults_(results) {
  var lines = results.map(function (result) {
    return (result.ok ? '[OK] ' : '[KO] ') + result.name + (result.error ? ' - ' + result.error : '');
  });

  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log(lines.join('\n'));
  } else if (typeof console !== 'undefined' && console.log) {
    console.log(lines.join('\n'));
  }
}

if (typeof module !== 'undefined' && module.exports && require.main === module) {
  runScoreEngineV1Tests();
}
