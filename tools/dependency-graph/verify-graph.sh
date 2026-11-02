#!/usr/bin/env bash
# Vérifie que le graphe de dépendances de GitHub contient chaque dépendance directe d'un instantané
# soumis. Le graphe se met à jour de façon asynchrone : on l'interroge jusqu'à environ cinq minutes.
#
# Usage : verify-graph.sh <instantané.json>
# Variables : GH_TOKEN (droit de lecture du contenu), GITHUB_REPOSITORY.
set -euo pipefail

readonly snapshot="$1"
readonly attempts=20
readonly delay_seconds=15

# Les purl n'ont pas toujours la même écriture des deux côtés : `%40nestjs` ou `@nestjs`, casse des
# noms Python. On compare une forme normalisée.
normalize() {
  sed 's/%40/@/g' | tr '[:upper:]' '[:lower:]' | sort -u
}

expected="$(mktemp)"
found="$(mktemp)"
trap 'rm -f "$expected" "$found"' EXIT

jq -r '.manifests[].resolved[] | select(.relationship == "direct") | .package_url' "$snapshot" \
  | normalize > "$expected"
echo "Dépendances directes attendues : $(wc -l < "$expected")"

for attempt in $(seq 1 "$attempts"); do
  gh api "repos/$GITHUB_REPOSITORY/dependency-graph/sbom" \
    --jq '.sbom.packages[].externalRefs[]? | select(.referenceType == "purl") | .referenceLocator' \
    | normalize > "$found"

  missing="$(comm -23 "$expected" "$found")"
  if [ -z "$missing" ]; then
    echo "Le graphe contient toutes les dépendances directes ($(wc -l < "$found") paquets au total)."
    exit 0
  fi

  echo "Essai $attempt/$attempts : $(echo "$missing" | wc -l) dépendances directes absentes du graphe."
  sleep "$delay_seconds"
done

echo "Dépendances directes toujours absentes du graphe :"
echo "$missing"
exit 1
