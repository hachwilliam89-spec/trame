#!/usr/bin/env bash
# Vérifie que le graphe de dépendances de GitHub contient chaque paquet d'un instantané soumis,
# dépendances directes comme transitives : les alertes de vulnérabilité portent sur les deux.
#
# Le graphe se met à jour de façon asynchrone après la soumission, et son export SBOM aussi : on
# demande un rapport, on attend qu'il soit prêt, on compare, puis on recommence si des paquets
# manquent encore, pendant une quinzaine de minutes au plus.
#
# Usage : verify-graph.sh <instantané.json>
# Variables : GH_TOKEN (lecture du contenu du dépôt), GITHUB_REPOSITORY.
set -euo pipefail

readonly snapshot="$1"
readonly comparisons=8
readonly report_polls=20
readonly delay_seconds=15

# Les purl n'ont pas toujours la même écriture des deux côtés (`%40nestjs` ou `@nestjs`, casse des
# noms Python) : on compare une forme normalisée.
normalize() {
  sed 's/%40/@/g' | tr '[:upper:]' '[:lower:]' | sort -u
}

# Demande un rapport SBOM du graphe, attend qu'il soit prêt, puis écrit ses purl dans le fichier $1.
# Tant que le rapport se prépare, la réponse est 202. Prêt, il redirige (302) vers une URL de
# téléchargement temporaire : curl la suit, sans y transmettre le jeton, réservé à l'hôte de l'API.
download_graph_purls() {
  local output="$1"
  local report
  report="$(mktemp)"
  local sbom_url
  sbom_url="$(gh api "repos/$GITHUB_REPOSITORY/dependency-graph/sbom/generate-report" --jq '.sbom_url')"

  for _ in $(seq 1 "$report_polls"); do
    local status
    status="$(curl --silent --show-error --location --output "$report" --write-out '%{http_code}' \
      --header "Authorization: Bearer $GH_TOKEN" \
      --header 'Accept: application/vnd.github+json' \
      "$sbom_url")"

    if [ "$status" = "200" ]; then
      jq -r '(.sbom // .).packages[].externalRefs[]? | select(.referenceType == "purl") | .referenceLocator' \
        "$report" | normalize > "$output"
      rm -f "$report"
      return 0
    fi
    if [ "$status" != "202" ]; then
      echo "Rapport SBOM : réponse HTTP $status inattendue." >&2
      rm -f "$report"
      return 1
    fi
    sleep "$delay_seconds"
  done

  echo "Rapport SBOM toujours en préparation après $report_polls essais." >&2
  rm -f "$report"
  return 1
}

expected="$(mktemp)"
found="$(mktemp)"
trap 'rm -f "$expected" "$found"' EXIT

jq -r '.manifests[].resolved[].package_url' "$snapshot" | normalize > "$expected"
echo "Paquets soumis, directs et transitifs : $(wc -l < "$expected")"

for attempt in $(seq 1 "$comparisons"); do
  download_graph_purls "$found"

  missing="$(comm -23 "$expected" "$found")"
  if [ -z "$missing" ]; then
    echo "Le graphe contient tous les paquets soumis ($(wc -l < "$found") paquets au total)."
    exit 0
  fi

  echo "Comparaison $attempt/$comparisons : $(wc -l <<< "$missing") paquets soumis absents du graphe."
  sleep "$delay_seconds"
done

echo "Paquets soumis toujours absents du graphe (20 premiers) :"
head -20 <<< "$missing"
exit 1
