# EDT-PRONOTE

Outil de répartition d'élèves en classes pour le collège, sur **Google Apps Script**
(scripts liés à des Google Sheets, déploiement via `clasp`).

Refondation propre du projet `score-pilotage-classes`, qui avait accumulé de la dette :
trois chemins d'import concurrents, deux tables de coefficients dupliquées, un pipeline
LEGACY coexistant avec le nouveau, et une logique de scoring éparpillée sur 36 fichiers.

> ## Règle directrice absolue
> **Un seul chemin pour chaque chose.** Ne jamais superposer deux logiques qui font la
> même chose. C'est la règle qui prime sur toutes les autres : à chaque ajout, on se
> demande d'abord *« est-ce que ça duplique un chemin existant ? »*.

---

## Architecture cible : multi-tenant

**Un seul code source** (`src/`), **quatre déploiements** (6e / 5e / 4e / 3e),
**quatre Google Sheets séparés**. Pas quatre dépôts.

```
        Dépôt EDT-PRONOTE  (code source unique = src/)
                      │ clasp push (deployments.json)
      ┌───────────┬───┴───────┬───────────┐
      ↓           ↓           ↓           ↓
  Sheet 6e    Sheet 5e    Sheet 4e    Sheet 3e
  +AppsScript +AppsScript +AppsScript +AppsScript
  NIVEAU=6e   NIVEAU=5e   NIVEAU=4e   NIVEAU=3e
  Prof 6e     Prof 5e     Prof 4e     Prof 3e   ← travail simultané, isolé
      └───────────┴─────┬─────┴───────────┘
                        ↓ (optionnel, lecture seule)
              Console Direction (vue globale)
```

Chaque instance connaît son niveau via `_CONFIG.NIVEAU` dans son propre spreadsheet.
Le même code se comporte différemment selon ce sélecteur, modifiable à tout moment.

---

## Décisions actées (ne pas rediscuter)

| Sujet | Décision |
|---|---|
| Plateforme | Google Apps Script |
| Échelle de score | **5 niveaux** : A=5, B=4, C=3, D=2, E=1 |
| Libellés | 5=Idéal · 4=Satisfaisant · 3=À consolider · 2=À surveiller · 1=Priorité d'accompagnement |
| Critères | 4 : **TRA** (Niveau scolaire) · **COM** (Comportement) · **ABS** (Absentéisme) · **PART** (« À définir » d'EDT = participation) |
| Transition | Le parser accepte A/B/C (3 niveaux) **et** A/B/C/D/E (5 niveaux). Mapping niveau→score **paramétrable**, jamais codé en dur |
| Architecture | Multi-tenant : 1 source, 4 déploiements, 4 Sheets |
| Sélecteur niveau | `_CONFIG.NIVEAU` du spreadsheet courant, format unique `"6e"` |
| Algo répartition | Conservé (équilibrage + swaps + DISSO/ASSO), étendu pour contraintes EDT |

## Décisions tranchées au démarrage (Sprint 0)

| Question | Choix retenu |
|---|---|
| **Source de référence** | Format normalisé interne, alimenté en priorité par le **parser EDT prérentrée** (scores A-E déjà fournis), extensible Pronote plus tard. Critères A/B/C aujourd'hui, A/B/C/D/E demain sans toucher au code. |
| **Migration de l'existant** | **Coupe nette** : bases fraîches en 1-5 uniquement. Convertisseur 1-4→1-5 en option plus tard si besoin. |
| **Contraintes EDT** (Regroupé avec / Séparé de / Verrou) | Lues depuis le fichier si présentes, sinon ajoutables ensuite. Parser **tolérant** dès le Sprint 2, moteur de contraintes en Sprint 3. |

---

## Organisation du dépôt

> **Layout plat (racine)** pour l'import via l'extension *Google Apps Script GitHub
> Assistant* : Apps Script ne gère pas les sous-dossiers, donc tous les fichiers
> déployables sont à la racine. L'ancien code `score-pilotage-classes` n'est plus
> dans l'arbre — il reste consultable dans l'historique git (commits antérieurs à
> la refondation, avant `7a29a6d`).

```
appsscript.json       ← manifeste Apps Script
Score.gs              ← échelle 1-5 UNIQUE : mapping A-E↔5-1, libellés, composite, helpers
Config.gs             ← _CONFIG (get/set) + getNiveau() unifié (format "6e")
ScoreSeuils.gs        ← seuils valeur→score 1-5 (mode Pronote-moyennes, optionnel)
Matieres.gs           ← coefficients matières par niveau (table UNIQUE)
ImportEDT.gs          ← parser EDT UNIQUE : CSV quote-aware, double en-tête, 3 états,
                        filtrage niveau, options (O)/(F)/(X), MEF spéciaux, preflight, dry-run
Repartition.gs        ← moteur de répartition UNIQUE : équilibrage (effectif/parité/niveau)
                        + moves + swaps, contraintes VERROU/ASSO/DISSO, rapport de conflits
Admin.gs              ← mot de passe admin simple par défaut, modifiable (aucune contrainte)
EcritureClasses.gs    ← écriture répartition → onglets de classes + BILAN
Code.gs               ← points d'entrée (menu, web app doGet, API serveur) — couche fine
Interface.html        ← UI UNIQUE : badge niveau permanent, import dry-run, répartition
tests/                ← non déployé. run_tests*.js (Node) + Tests_Score.gs (éditeur GAS)
                        fixtures/*.local.csv (gitignoré, RGPD)
scripts/deploy.sh     ← déploiement clasp multi-tenant (alternative à l'Assistant)
deployments.json      ← table des 4 cibles (scriptId + spreadsheetId par niveau)
.clasp.json.template  ← gabarit clasp (le .clasp.json réel est généré par deploy.sh, non commité)
```

### Déployer via le GitHub Assistant (méthode recommandée)

Dans l'éditeur Apps Script d'un Google Sheet, avec l'extension *Google Apps Script
GitHub Assistant* :

1. `Repository` : `FredtoAlpha/EDT-PRONOTE`
2. `Branch` : la branche de déploiement (ex. `claude/eloquent-feynman-UjRx8`)
3. Cliquer la flèche `↓` (pull). **Ne pas** cliquer `↑` (push) lors d'un import.

Les `.gs`/`.html`/`appsscript.json` de la racine arrivent dans le projet. Ensuite :
définir le niveau (`menu EDT-PRONOTE → Définir le niveau`) puis ouvrir la console.

### Ce qu'on a RÉCUPÉRÉ du legacy (réécrit propre, pas copié)

| Brique | Source legacy (historique git) | Réécrit dans |
|---|---|---|
| `parseOptions_` | `Backend_ImportDB.gs` | `ImportEDT.gs` (+ statuts (O)/(F)/(X)) |
| Coefficients matières (`MATIERES_PAR_NIVEAU`) | `Scoring_Matieres.gs` | `Matieres.gs` |
| `detectNiveauAuto()` / `lireNiveauDepuisConfig()` | doublons legacy | `Config.gs` → `getNiveau()` unique |
| Homonymes + preflight | `ImportAssistant_Server.gs` | `ImportEDT.gs` |
| DISSO/ASSO + swaps | `Orchestration_V14I.gs`, `App.Core.gs` | `Repartition.gs` |
| Seuils centralisés (`SCORING_DEFAULTS`) | `Scoring_Config.gs` | `ScoreSeuils.gs` |

### Ce qu'on a COUPÉ net (jamais reporté)

- Tout `LEGACY_*` (Pipeline, Mobility_Calculator, Logging…)
- La 2e table de coefficients dupliquée (`ia_calcScoreTRAPreview_`)
- Les 3 UI d'import concurrentes → **une seule** (`Interface.html`)
- Le calcul de scores depuis moyennes brutes en mode EDT (on a déjà A-E)
- Le double pipeline NAUTILUS + LEGACY → **un seul moteur** (`Repartition.gs`)
- Le doublon `lireNiveauDepuisConfig()` (`"6°"`) vs `detectNiveauAuto()` (`"6e"`) → **une fonction, format `"6e"`**

---

## Garde-fous (toute la durée du chantier)

1. **Aucune valeur de score en dur** hors du module `Score.gs`. Pas de `=== 4`, pas de `['1','2','3','4']` ailleurs.
2. **Aucune table de coefficients dupliquée.** Une seule, dans un seul fichier.
3. **Aucun chemin d'import concurrent.** Une seule UI, un seul parser.
4. Toujours distinguer **« colonne absente » / « valeur vide » / « valeur présente »**.
5. Mapping niveau→score **paramétrable** (transition A/B/C → A/B/C/D/E sans toucher au code).
6. Commits clairs, atomiques, par sprint. Pas de PR sans demande explicite.

---

## Plan de chantier

- [x] **Sprint 0 — Mise en place** : accès dépôt, branche, structure clasp, `deployments.json`, README, décisions ouvertes tranchées.
- [x] **Sprint 1 — Socle scoring 1-5 + config niveau** : `Score.gs` (échelle unique, mapping A-E↔5-1 paramétrable, libellés, `isEnDifficulte`/`isExcellent`, composite pondéré), `Config.gs` (niveau unifié `getNiveau()` format `"6e"`, remplace les 2 doublons), `ScoreSeuils.gs` (seuils 1-5 + percentile, mode Pronote optionnel), `Matieres.gs` (table coefficients unique). **47 tests Node OK**.
- [x] **Sprint 2 — Parser EDT (dry-run)** : `ImportEDT.gs` — CSV quote-aware, double en-tête, mapping colonnes auto, **3 états** (absent/vide/rempli), filtrage par niveau (MEF prévisionnel), `parseOptions` avec statuts (O)/(F)/(X), MEF spéciaux (UPE2A/ULIS), preflight (homonymes, profils, contraintes) + dry-run. **53 tests Node OK + smoke test sur le CSV réel (157 élèves)**. _Reste : UI d'import unique + écriture (quand les Google Sheets seront prêts)._
- [x] **Sprint 3 — Contraintes EDT + répartition** : `Repartition.gs` — moteur unique réécrit (remplace Orchestration_V14I + Phases_BASEOPTI_V3 + Phase4 + doublons LEGACY/NAUTILUS). Équilibrage multi-critères (effectif, parité F/G, niveau composite, élèves en difficulté) par **moves + swaps** ; **VERROU** (dur), **REGROUPÉ/ASSO** (fort, cassé seulement si impossible + signalement), **SÉPARÉ/DISSO** (fort, conflits résiduels signalés). **16 tests Node OK** dont répartition réelle 157→5 classes (31/32, parité et niveau homogènes). _Reste : UI d'affichage des conflits (avec les Sheets)._
- [x] **Sprint 4 — Multi-tenant + finition** : `scripts/deploy.sh` (4 instances depuis `deployments.json`), **UI unique** `Interface.html` avec **sélecteur de niveau** (changement immédiat, aucun verrou), glue `Code.gs` (menu + web app + API), écriture `EcritureClasses.gs` (onglets de classes + BILAN), **mot de passe admin simple par défaut** `Admin.gs` (modifiable librement, aucune contrainte imposée). _Reste : Script IDs des 4 Sheets à renseigner + test live._

---

## Tests

```bash
npm test            # logique pure du socle scoring (Node, sans Apps Script)
```

Les modules `src/*.gs` exposent un `module.exports` sous garde `typeof module`,
inerte sous Apps Script mais permettant de tester la logique pure en Node. Les
fonctions touchant `SpreadsheetApp` se testent dans l'éditeur via `tests/Tests_Score.gs`.

---

## Déploiement

```bash
npm i -g @google/clasp      # ou npx
npx clasp login
# Renseigner les scriptId dans deployments.json puis :
./scripts/deploy.sh 6e      # un niveau
./scripts/deploy.sh all     # les quatre
```

Le `.clasp.json` est généré à la volée par `deploy.sh` pour le niveau ciblé et n'est
jamais commité (il contient un `scriptId`).

> **RGPD** : aucun export d'élèves réel ne doit être commité. Les `*.local.csv` et le
> dossier `exports/` sont ignorés par git.
