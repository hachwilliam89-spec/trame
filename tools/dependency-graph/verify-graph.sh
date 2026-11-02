#!/usr/bin/env bash
# Vérifie que le graphe de dépendances de GitHub contient chaque paquet d'un instantané soumis,
# dépendances directes comme transitives : les alertes de vulnérabilité portent sur les deux.
#
# Le graphe se met à jour de façon asynchrone après la soumission, et son export SBOM aussi : on
# demande un rapport, on attend qu'il soit prêt, on compare, puis on recommence si des paquets
# manquent encore, jusqu'à une échéance globale.
#
# Usage : verify-graph.sh <instantané.json>
# Variables : GH_TOKEN (lecture du contenu du dépôt), GITHUB_REPOSITORY.
# Les tests peuvent raccourcir l'échéance et l'attente : VERIFY_DEADLINE_SECONDS, VERIFY_DELAY_SECONDS.
set -euo pipefail

readonly snapshot="$1"
# 15 minutes, et chaque appel réseau borné à 60 s : le pire cas reste sous le délai de 20 minutes
# du job, pour que le diagnostic s'affiche toujours.
readonly deadline_seconds="${VERIFY_DEADLINE_SECONDS:-900}"
readonly delay_seconds="${VERIFY_DELAY_SECONDS:-15}"

time_is_up() {
  [ "$SECONDS" -ge "$deadline_seconds" ]
}

# Les purl n'ont pas toujours la même écriture des deux côtés (`%40nestjs` ou `@nestjs`, casse des
# noms Python) : on compare une forme normalisée.
normalize() {
  sed 's/%40/@/g' | tr '[:upper:]' '[:lower:]' | sort -u
}

# Demande un rapport SBOM du graphe, attend qu'il soit prêt, puis écrit ses purl dans le fichier $1.
# Tant que le rapport se prépare, la réponse est 202. Prêt, il redirige (302) vers une URL de
# téléchargement temporaire : curl la suit, sans y transmettre le jeton, réservé à l'hôte de l'API.
# Échoue (code 1) si l'échéance arrive avant que le rapport soit prêt ; arrête tout sur une
# réponse inattendue.
download_graph_purls() {
  local output="$1"
  local report
  report="$(mktemp)"
  local sbom_url
  sbom_url="$(timeout 60 gh api "repos/$GITHUB_REPOSITORY/dependency-graph/sbom/generate-report" --jq '.sbom_url')"

  while ! time_is_up; do
    local status
    status="$(curl --silent --show-error --location --max-time 60 --output "$report" --write-out '%{http_code}' \
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
      exit 1
    fi
    sleep "$delay_seconds"
  done

  rm -f "$report"
  return 1
}

expected="$(mktemp)"
found="$(mktemp)"
trap 'rm -f "$expected" "$found"' EXIT

jq -r '.manifests[].resolved[].package_url' "$snapshot" | normalize > "$expected"
echo "Paquets soumis, directs et transitifs : $(wc -l < "$expected")"

comparisons=0
missing=""
while ! time_is_up; do
  if ! download_graph_purls "$found"; then
    break
  fi
  comparisons=$((comparisons + 1))

  missing="$(comm -23 "$expected" "$found")"
  if [ -z "$missing" ]; then
    echo "Le graphe contient tous les paquets soumis ($(wc -l < "$found") paquets au total)."
    exit 0
  fi

  echo "Comparaison $comparisons : $(wc -l <<< "$missing") paquets soumis absents du graphe."
  sleep "$delay_seconds"
done

echo "Échéance de $deadline_seconds s atteinte."
if [ "$comparisons" -eq 0 ]; then
  echo "Aucun rapport SBOM n'a été prêt à temps."
  exit 1
fi
echo "Paquets soumis toujours absents du graphe (20 premiers) :"
head -20 <<< "$missing"
exit 1
