# Mise a jour avec Google Apps Script GitHub Assistant

Ce depot est prepare pour l'extension **Google Apps Script GitHub Assistant**.

## Regle importante

Les scripts serveur Apps Script doivent etre en `.gs`, pas en `.js`.

- Fichiers serveur : `.gs`
- Interfaces : `.html`
- Manifeste : `appsscript.json`

Si les scripts sont en `.js`, l'extension peut ne recuperer que les fichiers HTML dans l'editeur Apps Script.

## Recuperer GitHub vers Apps Script

Dans l'editeur Apps Script :

1. Choisir `Repository` : `FredtoAlpha/score-pilotage-classes`
2. Choisir `Branch` : `main`
3. Cliquer sur la fleche vers le bas `↓`

Ne pas cliquer sur la fleche vers le haut `↑` pendant ce test : elle enverrait le contenu Apps Script vers GitHub.

## Tester l'assistant import

Apres recuperation :

1. Enregistrer si l'editeur le demande.
2. Recharger le Google Sheet.
3. Ouvrir `PILOTAGE CLASSE > Assistant Import Pronote`.

