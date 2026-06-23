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
