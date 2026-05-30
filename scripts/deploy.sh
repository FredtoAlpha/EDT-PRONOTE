#!/usr/bin/env bash
#
# deploy.sh — Deploiement multi-tenant EDT-PRONOTE.
# UN code source (src/), QUATRE cibles (6e/5e/4e/3e) listees dans deployments.json.
#
# Usage :
#   ./scripts/deploy.sh 6e        # pousse src/ vers le projet Apps Script du niveau 6e
#   ./scripts/deploy.sh all       # pousse vers les 4 niveaux successivement
#
# Pre-requis : clasp installe et authentifie (npx clasp login), jq, scriptId renseignes
# dans deployments.json.

set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOYMENTS="deployments.json"

push_one() {
  local niveau="$1"
  local script_id
  script_id=$(jq -r --arg n "$niveau" '.deployments[] | select(.niveau==$n) | .scriptId' "$DEPLOYMENTS")

  if [[ -z "$script_id" || "$script_id" == "null" ]]; then
    echo "ERREUR : niveau '$niveau' introuvable dans $DEPLOYMENTS" >&2
    exit 1
  fi
  if [[ "$script_id" == REMPLIR_* ]]; then
    echo "ERREUR : scriptId du niveau '$niveau' non renseigne dans $DEPLOYMENTS" >&2
    exit 1
  fi

  echo "→ Deploiement niveau $niveau (scriptId=$script_id)"
  printf '{\n  "scriptId": "%s",\n  "rootDir": "src"\n}\n' "$script_id" > .clasp.json
  npx clasp push --force
  echo "✓ $niveau pousse"
}

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "Usage: $0 <6e|5e|4e|3e|all>" >&2
  exit 1
fi

if [[ "$target" == "all" ]]; then
  for n in $(jq -r '.deployments[].niveau' "$DEPLOYMENTS"); do
    push_one "$n"
  done
else
  push_one "$target"
fi
