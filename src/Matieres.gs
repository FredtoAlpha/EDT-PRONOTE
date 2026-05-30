/**
 * ===================================================================
 * Matieres.gs — SOURCE UNIQUE des coefficients matieres par niveau
 * ===================================================================
 *
 * Porte (proprement) MATIERES_PAR_NIVEAU du legacy. UNE seule table.
 * Garde-fou : aucune autre table de coefficients ne doit exister dans le code.
 *
 * Usage : ponderation du critere TRA (niveau scolaire) lorsqu'il est calcule
 * depuis des moyennes Pronote (mode optionnel/futur). En mode EDT le score TRA
 * arrive deja sous forme A-E ; cette table sert alors d'information de structure.
 *
 * Les `patterns` servent a reconnaitre la colonne d'une matiere dans un export
 * Pronote. `multi:true` = matiere parfois eclatee sur plusieurs colonnes.
 * ===================================================================
 */

var MATIERES_PAR_NIVEAU = {
  '6e': [
    { nom: 'Francais',     patterns: ['FRANC', 'FRAN[CC]'],                                   coeff: 5.0 },
    { nom: 'Maths',        patterns: ['MATH'],                                                coeff: 4.5 },
    { nom: 'Histoire-Geo', patterns: ['HI.?GE', 'HIST.*G[EE]O', 'HG'],                        coeff: 3.0 },
    { nom: 'Anglais',      patterns: ['ANG.*MOY', 'AGL.*MOY', 'ANGLAIS', 'ANG(?!.*(?:ORAL|ECRI))'], coeff: 3.0 },
    { nom: 'EPS',          patterns: ['^EPS'],                                                coeff: 2.0 },
    { nom: 'Technologie',  patterns: ['TECHN'],                                               coeff: 1.5, multi: true },
    { nom: 'SVT',          patterns: ['^SVT'],                                                coeff: 1.5, multi: true },
    { nom: 'Arts Pla.',    patterns: ['A.?PLA', 'ARTS'],                                      coeff: 1.0 },
    { nom: 'Musique',      patterns: ['EDMUS', 'MUS'],                                        coeff: 1.0 }
    // Pas de LV2, pas de Phys-Chimie en 6e
  ],

  '5e': [
    { nom: 'Francais',     patterns: ['FRANC', 'FRAN[CC]'],                                   coeff: 4.5 },
    { nom: 'Maths',        patterns: ['MATH'],                                                coeff: 3.5 },
    { nom: 'Histoire-Geo', patterns: ['HI.?GE', 'HIST.*G[EE]O', 'HG'],                        coeff: 3.0 },
    { nom: 'Anglais',      patterns: ['ANG.*MOY', 'AGL.*MOY', 'ANGLAIS', 'ANG(?!.*(?:ORAL|ECRI))'], coeff: 3.0 },
    { nom: 'LV2',          patterns: ['ESP.*MOY', 'ALL.*MOY', 'ITA.*MOY', 'ESP[^O]*$', 'ALL[^O]*$', 'ITA[^O]*$'], coeff: 2.5 },
    { nom: 'EPS',          patterns: ['^EPS'],                                                coeff: 2.0 },
    { nom: 'Phys.-Chimie', patterns: ['PH.?CH', 'PHYS', 'SC.?PH'],                            coeff: 1.5, multi: true },
    { nom: 'SVT',          patterns: ['^SVT'],                                                coeff: 1.5, multi: true },
    { nom: 'Technologie',  patterns: ['TECHN'],                                               coeff: 1.5, multi: true },
    { nom: 'Arts Pla.',    patterns: ['A.?PLA', 'ARTS'],                                      coeff: 1.0 },
    { nom: 'Musique',      patterns: ['EDMUS', 'MUS'],                                        coeff: 1.0 },
    { nom: 'Latin',        patterns: ['LAT', 'LCALA'],                                        coeff: 1.0 }
  ],

  '4e': [
    { nom: 'Francais',     patterns: ['FRANC', 'FRAN[CC]'],                                   coeff: 4.5 },
    { nom: 'Maths',        patterns: ['MATH'],                                                coeff: 4.0 },
    { nom: 'Histoire-Geo', patterns: ['HI.?GE', 'HIST.*G[EE]O', 'HG'],                        coeff: 3.0 },
    { nom: 'Anglais',      patterns: ['ANG.*MOY', 'AGL.*MOY', 'ANGLAIS', 'ANG(?!.*(?:ORAL|ECRI))'], coeff: 3.0 },
    { nom: 'LV2',          patterns: ['ESP.*MOY', 'ALL.*MOY', 'ITA.*MOY', 'ESP[^O]*$', 'ALL[^O]*$', 'ITA[^O]*$'], coeff: 2.5 },
    { nom: 'EPS',          patterns: ['^EPS'],                                                coeff: 2.0 },
    { nom: 'Phys.-Chimie', patterns: ['PH.?CH', 'PHYS', 'SC.?PH'],                            coeff: 2.0, multi: true },
    { nom: 'SVT',          patterns: ['^SVT'],                                                coeff: 1.5, multi: true },
    { nom: 'Technologie',  patterns: ['TECHN'],                                               coeff: 1.5, multi: true },
    { nom: 'Arts Pla.',    patterns: ['A.?PLA', 'ARTS'],                                      coeff: 1.0 },
    { nom: 'Musique',      patterns: ['EDMUS', 'MUS'],                                        coeff: 1.0 },
    { nom: 'Latin',        patterns: ['LAT', 'LCALA'],                                        coeff: 1.5 },
    { nom: 'Grec',         patterns: ['GREC'],                                                coeff: 1.0 }
  ],

  '3e': [
    { nom: 'Francais',     patterns: ['FRANC', 'FRAN[CC]'],                                   coeff: 5.0 },
    { nom: 'Maths',        patterns: ['MATH'],                                                coeff: 5.0 },
    { nom: 'Histoire-Geo', patterns: ['HI.?GE', 'HIST.*G[EE]O', 'HG'],                        coeff: 3.5 },
    { nom: 'Anglais',      patterns: ['ANG.*MOY', 'AGL.*MOY', 'ANGLAIS', 'ANG(?!.*(?:ORAL|ECRI))'], coeff: 3.0 },
    { nom: 'LV2',          patterns: ['ESP.*MOY', 'ALL.*MOY', 'ITA.*MOY', 'ESP[^O]*$', 'ALL[^O]*$', 'ITA[^O]*$'], coeff: 2.5 },
    { nom: 'EPS',          patterns: ['^EPS'],                                                coeff: 2.0 },
    { nom: 'Phys.-Chimie', patterns: ['PH.?CH', 'PHYS', 'SC.?PH'],                            coeff: 2.5, multi: true },
    { nom: 'SVT',          patterns: ['^SVT'],                                                coeff: 2.0, multi: true },
    { nom: 'Technologie',  patterns: ['TECHN'],                                               coeff: 1.5, multi: true },
    { nom: 'Arts Pla.',    patterns: ['A.?PLA', 'ARTS'],                                      coeff: 1.0 },
    { nom: 'Musique',      patterns: ['EDMUS', 'MUS'],                                        coeff: 1.0 },
    { nom: 'Latin',        patterns: ['LAT', 'LCALA'],                                        coeff: 2.0 },
    { nom: 'Grec',         patterns: ['GREC'],                                                coeff: 1.0 }
  ]
};

/**
 * Matieres + coefficients pour un niveau. Normalise l'entree via Config.
 * Fallback explicite sur le niveau courant si inconnu (jamais un fallback muet
 * arbitraire : on loggue).
 *
 * @param {string} [niveau] defaut = getNiveau()
 * @returns {Array<{nom:string,patterns:string[],coeff:number,multi?:boolean}>}
 */
function getMatieres(niveau) {
  var key = (typeof normalizeNiveau === 'function') ? normalizeNiveau(niveau) : niveau;
  if (!key && typeof getNiveau === 'function') key = getNiveau();
  if (MATIERES_PAR_NIVEAU.hasOwnProperty(key)) return MATIERES_PAR_NIVEAU[key];
  if (typeof Logger !== 'undefined') Logger.log('getMatieres: niveau inconnu "' + niveau + '", fallback 5e');
  return MATIERES_PAR_NIVEAU['5e'];
}

// Export Node pour les tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MATIERES_PAR_NIVEAU: MATIERES_PAR_NIVEAU };
}
