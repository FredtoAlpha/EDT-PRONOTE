# Audit import actuel et specification d'un assistant reel

Date: 2026-04-29

## Verdict

L'import actuel contient deja beaucoup de logique utile. Il sait lire des exports
Pronote bruts, detecter des colonnes, calculer les scores COM/TRA/PART/ABS et
creer les onglets sources.

Le probleme principal n'est pas le moteur de parsing. Le probleme est le workflow:
l'utilisateur doit comprendre seul quel export coller, dans quel ordre, ce qui est
optionnel, ce qui est bloquant, et ce que le systeme a vraiment compris.

L'assistant a creer doit donc encapsuler l'existant, pas l'effacer.

## Ce que l'import actuel attend vraiment

### Etape 1 - Liste eleves

Fonction serveur: `v3_parseListeEleves(rows)`

Donnees brutes attendues:

- NOM
- PRENOM si disponible
- SEXE
- CLASSE
- Toutes les options, ou colonne LV2/LANGUE separee
- Projet d'accompagnement / dispositif si disponible

Ce parsing produit:

- nom
- prenom
- sexe
- classe
- lv2
- opt
- dispo

### Etape 2 - Notes / moyennes

Fonction serveur: `v3_parseNotesMoyennes(rows)`

Donnees brutes attendues:

- un collage par classe
- NOM/PRENOM ou cellule eleve
- CLASSE si presente
- moyennes par matiere
- eventuellement colonnes oral pour PART

Ce parsing produit:

- moyennes par matiere pour TRA
- oraux pour PART

### Etape 3 - Absences

Fonction serveur: `v3_parseAbsences(rows)`

Formats acceptes:

- recapitulatif par eleve
- liste evenementielle

Ce parsing produit:

- demi-journees d'absence
- non justifiees

### Etape 4 - Comportement

Fonctions serveur:

- `v3_parseObservations(rows)`
- `v3_parsePunitions(rows)`
- `v3_parseIncidents(rows)`

Donnees brutes attendues:

- observations de feuille d'appel
- punitions / retenues
- incidents / faits graves

Ce parsing produit:

- observations negatives
- encouragements
- punitions
- incidents

### Compilation

Fonction serveur: `v3_compileImport(data)`

Elle fusionne par NOM/PRENOM, calcule les scores, cree ou ecrase les onglets
sources, genere les IDs, consolide, puis propose des groupes DISSO.

Colonnes source creees:

- ID_ELEVE
- NOM
- PRENOM
- NOM_PRENOM
- SEXE
- LV2
- OPT
- COM
- TRA
- PART
- ABS
- DISPO
- ASSO
- DISSO
- SOURCE

## Points forts actuels

- Le systeme accepte des exports Pronote bruts au lieu d'un format maison.
- La liste eleves extrait deja LV2, options et dispositifs.
- Les notes gerent des headers repetes et certaines sous-lignes "Abs".
- Les absences acceptent recapitulatif ou evenementiel.
- Le comportement separe observations, punitions et incidents.
- Le matching NOM/PRENOM contient plusieurs fallbacks.
- La compilation genere les onglets sources au format attendu par le reste du projet.
- Les IDs et la consolidation sont lances automatiquement apres import.

## Findings prioritaires

### 1. Compilation possible trop tot

Dans `ConsolePilotageV3.html`, la section de compilation devient visible des que
la liste eleves est chargee. `runCompileImport()` ne bloque que l'absence
d'eleves.

Risque:

- l'utilisateur peut compiler sans notes;
- ou sans absences;
- ou sans comportement;
- les scores restent vides ou incomplets;
- les onglets sources sont quand meme crees/ecrases.

Action assistant:

- ajouter un preflight obligatoire avant compilation;
- exiger "notes importees" ou "je n'ai pas de notes";
- exiger "absences importees" ou "je n'ai pas d'absences";
- exiger "comportement importe" ou "je n'ai pas ces donnees";
- afficher clairement les consequences avant ecriture.

### 2. Le parseur client ne gere pas bien les CSV francais

`parseTSV()` detecte les tabulations, sinon il parse en CSV a virgules.
Les exports francais Excel/Pronote sont souvent separes par point-virgule.

Risque:

- l'utilisateur colle un CSV valide;
- tout arrive comme une seule colonne;
- le serveur repond "NOM introuvable";
- l'utilisateur pense que son fichier est mauvais.

Action assistant:

- detection automatique tabulation / point-virgule / virgule;
- affichage du separateur detecte;
- preview avant envoi serveur.

### 3. Matching fragile sans identifiant stable

La fusion se fait par NOM/PRENOM. En cas d'homonyme ou de nom compose, le systeme
peut ecraser ou mal matcher.

Risque:

- deux eleves avec meme NOM/PRENOM;
- un export avec "NOM Prenom" dans une seule cellule;
- une note ou absence rattachee au mauvais eleve;
- erreurs invisibles avant la compilation.

Action assistant:

- detecter les doublons NOM/PRENOM avant compilation;
- utiliser une colonne stable si disponible: ID Pronote, INE, date de naissance;
- afficher les non-matches et matches ambigus;
- bloquer les ambigus.

### 4. Les matieres sont codees en dur dans l'import multi-paste

`v3_parseNotesMoyennes()` contient son propre `matieresConfig`.
Pourtant `Scoring_Matieres.js` expose deja `getMatieresForLevel()`.

Risque:

- divergence entre la config scoring et l'import;
- niveau 6e/5e/4e/3e mal pris en compte;
- changement de matiere a corriger a deux endroits;
- score TRA/PART incoherent avec les reglages.

Action assistant:

- utiliser `detectNiveauAuto()` puis `getMatieresForLevel(niveau)`;
- montrer les matieres detectees;
- permettre de corriger une colonne matiere non reconnue.

### 5. Les erreurs importantes restent dans les logs

Les notes non matchees, absences non matchees, punitions non matchees ou
incidents non matches sont surtout logges ou resumes en chiffres.

Risque:

- l'utilisateur voit "import termine";
- mais plusieurs eleves n'ont pas leurs notes ou absences;
- impossible de savoir lesquels sans logs.

Action assistant:

- rapport visible par etape:
  - importes;
  - matches;
  - non matches;
  - ambigus;
  - ignores.
- tableau "a corriger avant compilation".

### 6. Les donnees optionnelles ne sont pas distinguees des donnees absentes

`OPT vide` est signale pour tous les eleves sans option. Or la plupart des
eleves n'ont pas d'option: ce n'est pas une anomalie.

Risque:

- alertes inutiles;
- l'utilisateur ne sait pas si l'export est incomplet ou si l'eleve n'a pas
  d'option.

Action assistant:

- distinguer:
  - colonne option absente;
  - colonne option presente mais eleve sans option;
  - option inconnue;
  - option incompatible avec la structure.

### 7. Ecriture destructive sans plan visible

La compilation efface les onglets sources existants avant de les reecrire.

Risque:

- l'utilisateur compile trop tot;
- les anciennes donnees sont remplacees;
- difficile de revenir en arriere.

Action assistant:

- afficher un plan d'ecriture:
  - onglets crees;
  - onglets remplaces;
  - nombre d'eleves par onglet;
  - consolidation impactee.
- creer une sauvegarde avant ecriture;
- bouton final explicite: "Ecrire dans Google Sheets".

### 8. Deux logiques d'import coexistent

Il y a:

- l'import multi-paste dans `Backend_ImportDB.js`;
- les onglets `DATA_*` dans `Backend_Scores.js`.

Risque:

- confusion produit;
- deux parcours pour obtenir des scores;
- duplication de logique de detection.

Action assistant:

- choisir un parcours principal;
- garder l'autre en mode avance;
- partager les detecteurs colonnes et le scoring.

## Assistant cible

### Principe

L'assistant doit etre un tunnel. Une seule decision principale par ecran.
Les details techniques doivent etre dans des panneaux ouvrants.

### Ecran 0 - Choisir la source

Questions:

- Je pars de Pronote par copier-coller.
- Je pars d'un CSV/Excel.
- Je veux reprendre des onglets deja presents.

Sortie:

- mode d'import choisi;
- instructions adaptees.

### Ecran 1 - Liste eleves

Objectif:

- construire la cohorte de reference.

UI:

- zone de collage ou fichier;
- bouton "Analyser la liste eleves";
- panneau "Comment exporter depuis Pronote";
- preview des 10 premieres lignes;
- colonnes reconnues;
- erreurs bloquantes.

Bloquants:

- aucun eleve;
- NOM absent;
- CLASSE absente;
- doublons non resolus.

Alertes:

- sexe manquant;
- LV2 absente;
- option inconnue;
- dispositif non reconnu.

### Ecran 2 - Notes

Objectif:

- importer les moyennes par classe pour calculer TRA/PART.

UI:

- checklist des classes attendues depuis l'etape 1;
- zone "coller une classe";
- badge par classe importee;
- detection matieres;
- tableau des eleves non matches.

Boutons:

- "Ajouter cette classe";
- "Je n'ai pas de notes";
- "Terminer les notes".

Bloquants:

- classe importee vide;
- trop de non-matches;
- doublons ambigus.

### Ecran 3 - Absences

Objectif:

- importer ABS.

UI:

- choix du type detecte: recapitulatif ou evenementiel;
- colonnes reconnues: NOM, CLASSE, DJ, NJ/JUSTIF;
- rapport matches/non matches.

Boutons:

- "Analyser les absences";
- "Je n'ai pas d'absences".

### Ecran 4 - Comportement

Objectif:

- importer COM depuis observations/punitions/incidents.

UI:

- trois sous-cartes ouvrantes:
  - observations;
  - punitions/retenues;
  - incidents/faits graves.
- chacune peut etre remplie ou ignoree.

Boutons:

- "Analyser comportement";
- "Je n'ai pas ces donnees".

### Ecran 5 - Preflight final

Objectif:

- ne rien ecrire tant que l'import n'est pas defendable.

Affichage:

- total eleves;
- classes trouvees;
- notes importees par classe;
- taux de matching;
- scores calculables;
- eleves incomplets;
- doublons;
- onglets qui seront crees/remplaces.

Zones:

- Bloquant;
- A verifier;
- Informatif.

### Ecran 6 - Apercu scoring

Objectif:

- montrer ce que le moteur a compris avant creation des onglets.

Affichage:

- distribution COM 1/2/3/4;
- distribution TRA 1/2/3/4;
- distribution PART 1/2/3/4;
- distribution ABS 1/2/3/4;
- 10 exemples d'eleves;
- liste des eleves sans score.

Action:

- modifier les seuils;
- accepter les seuils.

### Ecran 7 - Ecriture Google Sheets

Objectif:

- operation finale, explicite et reversible.

Affichage:

- plan d'ecriture;
- sauvegarde creee;
- onglets impactes.

Bouton:

- "Ecrire les onglets sources".

### Ecran 8 - Rapport final

Objectif:

- dire ce qui a ete fait et ce qui reste a traiter.

Affichage:

- classes creees;
- eleves importes;
- scores calcules;
- contraintes DISSO suggerees;
- actions suivantes:
  - verifier structure;
  - lancer generation;
  - ouvrir Interface V2.

## Architecture technique recommandee

### Nouveaux fichiers

- `ImportAssistant.html`
- `ImportAssistant_Server.js`
- `ImportAssistant_Parser.js`
- `ImportAssistant_Report.js`

### Objets internes

```js
ImportSession = {
  id,
  mode,
  rawInputs,
  parseResults,
  normalizedStudents,
  matchingReports,
  scoringPreview,
  writePlan,
  status
}
```

### API serveur

```js
ia_startSession(config)
ia_analyzeStudentsPaste(rows)
ia_analyzeNotesPaste(rows, sessionId)
ia_analyzeAbsencesPaste(rows, sessionId)
ia_analyzeBehaviorPaste(payload, sessionId)
ia_buildPreflight(sessionId)
ia_previewScoring(sessionId)
ia_buildWritePlan(sessionId)
ia_commitImport(sessionId)
```

### Principe cle

Les fonctions existantes `v3_parse*` peuvent etre reutilisees, mais elles doivent
etre enveloppees par une couche assistant qui:

- detecte les formats;
- construit les rapports;
- bloque les risques;
- demande confirmation avant ecriture.

## Priorites d'implementation

1. Remplacer le parseur client par un parseur delimiter-aware.
2. Ajouter un preflight avant `v3_compileImport`.
3. Afficher les non-matches et les doublons.
4. Rendre les etapes optionnelles explicitement skippables.
5. Cacher la compilation tant que le preflight n'est pas valide.
6. Reutiliser `Scoring_Matieres.js` dans l'import notes.
7. Ajouter un plan d'ecriture et une sauvegarde avant `sheet.clear()`.
8. Creer le vrai tunnel `ImportAssistant.html`.

