# Pilotage par le fichier : classe(s) imposée(s)

Branche dédiée `claude/classe-imposee`. Objectif : permettre de **forcer** la
ou les classes cibles d'un élève directement depuis le fichier Pronote, sans
laisser le moteur recalculer son affectation.

## Contrat de données (ce que TU remplis dans le fichier)

On **réutilise la colonne Pronote « Classe prévisionnelle »** (colonne 8 de
`repartition_2026.xlsx`, aujourd'hui vide partout). En montée 4e→3e, le moteur
lit « Ancienne classe » pour l'origine : « Classe prévisionnelle » est donc
totalement libre.

| Contenu de la cellule | Sens | Effet moteur (à coder) |
|---|---|---|
| *(vide)* | rien d'imposé | comportement actuel : le moteur calcule tout seul |
| `3°1` | **une** classe imposée | élève placé en 3°1, marqué **FIXE** dans cette classe |
| `3°2\|3°3` | **plusieurs** classes permises | classes compatibles restreintes à {3°2, 3°3} → mobilité **PERMUT** (2) ou **LIBRE** (3+) |

### Règles d'écriture
- **Format de classe** : avec le degré, exactement comme les classes cibles —
  `3°1`, `3°2`… (pas `301`).
- **Séparateur multi-classes** : **barre verticale** `|` — jamais la virgule
  (réservée au CSV). Ex. `3°2|3°3`.
- Espaces autour du `|` tolérés (`3°2 | 3°3`).
- Casse/accent libres : `3°1` normalisé de toute façon.

### Cas d'usage prévus
- **MUSIQUE / ULIS / UPE2A** : une seule classe imposée → pré-affectés + FIXE.
- **Élève à cheval** (ex. peut aller en 3°2 ou 3°3) : `3°2|3°3`.
- **Élève libre** : laisser vide.
- **DEFENSE** (cohorte sur 2 classes) : classe imposée = les 2 classes défense
  (ex. `3°3|3°4`). Voir section dédiée ci-dessous.

---

# Classe DEFENSE (cohorte + badge)

Nouveauté des 4e qui montent en 3e : une **classe défense**, dont les élèves
sont **regroupés dans 2 classes** définies. Décision validée : DEFENSE est
traitée comme une **cohorte**, PAS comme une 2e option concurrente — pour ne
pas réécrire le système d'options (champ `OPT` unique).

Un élève défense peut **cumuler** une autre option (GREC, LATIN, CHAV). Les
deux infos voyagent sur des canaux séparés :

| Information | Canal | Stockage |
|---|---|---|
| Placement (les 2 classes défense) | colonne H « classe imposée » | ex. `3°3\|3°4` |
| Appartenance défense (badge carte) | drapeau `DEFENSE` | nouveau champ booléen |
| Autre option (GREC/LATIN/CHAV) | champ `OPT` normal | inchangé |
| LV2 (ESP/ITA) | champ `LV2` normal | inchangé |

### Ce que TU écris dans le fichier pour un élève défense
- **col G (Options précédentes)** : ajoute `, DEFENSE` à la fin.
  Ex. `ANGLAIS LV1 (O), ESPAGNOL LV2 (O), GREC, DEFENSE`
  (le mot DEFENSE est ajouté à la main ; Pronote ne l'exporte pas).
- **col H (Classe prévisionnelle)** : les 2 classes défense, ex. `3°3|3°4`.

### Résultat attendu après import (élève défense + grec)
`LV2=ESP` · `OPT=GREC` · `DEFENSE=oui` · classes permises = {3°3, 3°4}
→ carte affiche 3 badges : ESP, GREC, **DEFENSE** ; placement garanti dans
les 2 classes défense ; mobilité PERMUT entre 3°3 et 3°4.

### Code à ajouter (5 points, comme CHAV mais SANS quota d'option)
1. `Backend_ImportDB.gs parseOptions_` : détecter le token `DEFENSE` →
   poser `result.defense = true` (NE PAS écraser `result.opt`).
2. `Import_EDT.gs` : propager le drapeau `DEFENSE` (nouvelle colonne source,
   ex. `DEFENSE` ou réutiliser un champ libre) jusqu'à CONSOLIDATION.
3. `InterfaceV2_CoreScript.html` : si `eleve.defense`, ajouter
   `createBadge('opt', 'DEFENSE')` (ou type dédié).
4. `InterfaceV2_Styles.html` : `.badge-DEFENSE { ... }` (couleur dédiée,
   ex. kaki/vert militaire — à choisir).
5. Formateurs FIN : colorer la mention DEFENSE si affichée.

> ⚠️ Code interne = `DEFENSE`, **JAMAIS `DEF`** : `DEF` est déjà le suffixe
> des onglets définitifs (`3°3DEF`) et figure dans les regex d'exclusion
> `/TEST|CACHE|DEF|FIN/`. Réutiliser `DEF` provoquerait des collisions.

## Garde-fous (à coder côté moteur)
1. Une classe imposée doit exister dans la structure (sinon : warning + ignore).
2. La classe imposée doit rester **compatible LV2/option** de l'élève (sinon :
   warning explicite — on ne place pas un latiniste dans une classe sans latin).
3. DISSO/ASSO gardent la priorité : une imposition ne doit pas violer une
   séparation déjà demandée (à arbitrer : warning + on respecte DISSO).
4. Si la classe imposée est pleine (effectif cible atteint) : warning, mais on
   force quand même (l'imposition prime sur le quota d'effectif).

## Chemin technique (repères dans le code)
- Import : `Import_EDT.gs` → `edtImportCore_` lit déjà `CLASSE_PREV` (clé interne
  `CLASSE_PREV`). Il faut la **propager** dans les onglets sources + CONSOLIDATION.
- Placement : `LEGACY_Phase1_OptionsLV2.gs` (lit CONSOLIDATION, écrit `assigned`).
  Point d'injection : avant la boucle de placement par quota, traiter d'abord
  les élèves à classe imposée.
- Mobilité : `LEGACY_Mobility_Calculator.gs` → `calculerMobiliteEleve_LEGACY`,
  variable `classesCompatibles` (ligne ~187) : si une classe imposée existe,
  remplacer/intersecter cette liste.

> ⚠️ Rien n'est codé tant que ce document n'est pas validé. Il fixe le format
> AVANT le remplissage manuel du fichier, pour éviter de tout refaire.

---

# Dispositifs (PAP / GEVASCO / ULIS…) — marqueur unique

Décision validée : **affichage + stats uniquement** (le moteur n'équilibre PAS
sur les dispositifs). Un seul **marqueur dominant** par élève — pas de liste,
car le compteur de stats lit la cellule en bloc (`ULIS|GEVASCO|PAP` créerait
une fausse catégorie au lieu de compter chaque dispositif).

### Colonne à ajouter dans le fichier
- **Nom d'en-tête exact** : `Dispositif`  (reconnu par les stats existantes :
  `DISPOSITIF / DISPO / DISPOSITIFS` → mappé sur le champ interne `DISPO`).
- **Position** : libre (l'outil se repère sur le nom, pas la colonne). Pratique
  après « Verrou ».
- **Contenu** : UN seul code, le marqueur le plus haut dont relève l'élève.

### Gradation (ordre de priorité décroissant)
`ULIS > GEVASCO > PAP`
- Élève cumulant plusieurs dispositifs → écrire le plus haut.
  Ex. élève GEVASCO + PAP → `GEVASCO`. Élève ULIS + PPS + PAP → `ULIS`.
- Cellule vide = aucun dispositif (pas de badge).

### Effet attendu
- Carte V2 : badge `dispo` affiché (déjà géré, `createBadge('dispo', …)`).
- Stats : `calculerDispositifs` compte proprement par marqueur.
- Moteur de répartition : **aucun impact** (pas d'équilibrage dispositif).
  ⚠️ Ne pas confondre avec ULIS comme *classe imposée* : si un élève ULIS doit
  aller dans une classe précise, c'est la colonne H (classe imposée) qui le gère,
  pas ce marqueur (qui reste purement informatif).

### Code à ajouter
1. `Import_EDT.gs` : lire la colonne `Dispositif` du fichier et la propager dans
   le champ `DISPO` des onglets sources (aujourd'hui `DISPO` ne reçoit que
   'FIXE' via le verrou — il faut conserver FIXE ET ajouter le dispositif, ou
   trancher la cohabitation des deux infos dans la même colonne).
2. `InterfaceV2_Styles.html` : badges `.badge-ULIS`, `.badge-GEVASCO`,
   `.badge-PAP` (couleurs à définir).

> ⚠️ Point de vigilance : aujourd'hui la colonne `DISPO` sert AUSSI à porter
> 'FIXE' (verrou). Si un élève est à la fois verrouillé ET a un dispositif, les
> deux infos se disputent la même colonne. À arbitrer au moment du code
> (probable : séparer mobilité/FIXE du dispositif dans deux champs distincts).
