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
Le même code se comporte différemment selon ce sélecteur, verrouillé après init.

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

```
src/                  ← SOURCE DE VÉRITÉ. Seul dossier poussé par clasp. Code propre 1-5.
  appsscript.json     ← manifeste Apps Script
legacy/               ← ancien code score-pilotage-classes. RÉFÉRENCE LECTURE SEULE.
                        Jamais déployé. On y relit les briques à réécrire propre, on n'y touche pas.
scripts/deploy.sh     ← déploiement multi-tenant (1 commande → 1 ou 4 instances)
deployments.json      ← table des 4 cibles (scriptId + spreadsheetId par niveau)
.clasp.json.template  ← gabarit clasp (le .clasp.json réel est généré par deploy.sh, non commité)
```

### Ce qu'on RÉCUPÈRE de `legacy/` (à réécrire propre, pas copier tel quel)

| Brique | Source legacy | Pourquoi |
|---|---|---|
| `parseOptions_` | `Backend_ImportDB.gs` | Parsing options Pronote fonctionnel |
| Coefficients matières par niveau | `Scoring_Matieres.gs` (`MATIERES_PAR_NIVEAU`) | Bien structuré |
| `detectNiveauAuto()` | `Scoring_Matieres.gs` | Détection niveau robuste |
| Détection homonymes + preflight | `ImportAssistant_Server.gs` | Bonne UX de contrôle avant écriture |
| Contraintes DISSO/ASSO + moteur de swaps | `Orchestration_V14I.gs`, `App.Core.gs` | Cœur algo, le plus de valeur |
| Seuils centralisés | `Scoring_Config.gs` (`SCORING_DEFAULTS`) | Un seul endroit pour les seuils |

### Ce qu'on COUPE net (ne jamais reporter dans `src/`)

- Tout `LEGACY_*` (Pipeline, Mobility_Calculator, Logging…)
- La 2e table de coefficients dupliquée (`ia_calcScoreTRAPreview_`)
- Les 3 UI d'import concurrentes → **une seule**
- Le calcul de scores depuis moyennes brutes en mode EDT (on a déjà A-E)
- Le double pipeline NAUTILUS + LEGACY → **un seul moteur**
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
- [ ] **Sprint 1 — Socle scoring 1-5 + config niveau** : `Score.gs` (échelle unique, mapping A-E↔5-1, libellés, `isEnDifficulte`/`isExcellent`), `Config.gs` (niveau unifié format `"6e"`), seuils 5 niveaux, coefficients matières uniques, tests.
- [ ] **Sprint 2 — Parser EDT + import** : `ImportEDT.gs` (double en-tête, mapping configurable, 3 états, filtrage `_CONFIG.NIVEAU`, LV2/OPT, MEF spéciaux), preflight, **UI d'import unique**, dry-run sur CSV réel.
- [ ] **Sprint 3 — Contraintes EDT + répartition** : modèle élève étendu (regroupeAvec / separeDe / verrou), moteur adapté (verrou = dur, regroupé/séparé = forts), affichage conflits résiduels.
- [ ] **Sprint 4 — Multi-tenant + finition** : `deploy.sh` 4 instances, badge niveau permanent, console direction (option), mot de passe admin robuste en `_CONFIG!B2` (RGPD).

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
