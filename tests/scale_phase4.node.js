// SMOKE TEST du moteur Phase4_Ultimate — exécution Node UNIQUEMENT (ne pas pousser dans Apps Script).
// Usage : node tests/smoke_phase4.node.js  (depuis la racine du dépôt)
// Construit un mini-collège synthétique (60 élèves, 3 classes dont une « ghetto » sans tête,
// LATIN offert dans 2 classes, élèves FIXE) puis exécute la VRAIE boucle du moteur et vérifie :
// score en baisse, FIXE immobiles, LATIN jamais hors classes LATIN, effectifs constants, unicité.
const fs = require("fs"); const path = require("path"); const ROOT = path.join(__dirname, "..");
const src = [
  "var SpreadsheetApp={getActiveSpreadsheet:()=>null,getUi:()=>({alert:()=>{}})}; var Logger={log:()=>{}}; function logLine(){}",
  fs.readFileSync(path.join(ROOT, "App.HarmonyConstants.gs"), "utf8"),
  fs.readFileSync(path.join(ROOT, "Phase4_Ultimate.gs"), "utf8"),
  fs.readFileSync(path.join(__dirname, "scale_phase4_driver.js"), "utf8")
].join("\n;\n");
eval(src);
