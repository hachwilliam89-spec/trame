#!/usr/bin/env bash
# Construit une image en layout OCI, la scanne et vérifie ses attestations, sans la publier.
#
#   build-and-scan.sh <nom> <dockerfile> <cible> <dossier de sortie> <dossier des rapports>
#
# Utilisé par le workflow de publication (US-005 B1, issue #44) et par la preuve de la CI : les
# deux suivent exactement le même chemin. Attend dans l'environnement :
#   BUILDER          builder buildx à pilote docker-container (l'export OCI garde les attestations)
#   SBOM_GENERATOR   image du générateur SBOM de BuildKit, figée par digest
#   SCAN_REGISTRY    registre local éphémère (127.0.0.1:5000), en HTTP
#   REVISION         commit construit
#
# Produit dans le dossier de sortie : <nom>/ (le layout) et <nom>.scanned-digest (digest de
# l'index de l'image). Le rapport complet <nom>.trivy.json va dans un dossier à part, envoyé même
# quand le contrôle bloquant échoue : c'est alors qu'on en a besoin.
set -euo pipefail

name="$1" dockerfile="$2" target="$3" output_directory="$4" reports_directory="$5"
layout="$output_directory/$name"
mkdir -p "$output_directory" "$reports_directory"

# Le layout garde l'index de l'image, son manifeste linux/amd64 et le manifeste d'attestation
# (SBOM et provenance). Le stockage Docker classique, lui, les perdrait.
docker buildx build \
  --builder "$BUILDER" \
  --platform linux/amd64 \
  --file "$dockerfile" \
  --target "$target" \
  --attest "type=sbom,generator=$SBOM_GENERATOR" \
  --attest type=provenance,mode=max \
  --label "org.opencontainers.image.source=https://github.com/hachwilliam89-spec/trame" \
  --label "org.opencontainers.image.revision=$REVISION" \
  --output "type=oci,dest=$layout,tar=false" \
  .

digest="$(pnpm --silent release-images layout-digest "$layout")"
echo "$digest" > "$output_directory/$name.scanned-digest"
echo "Index de l'image $name : $digest"

# Le scan porte sur le digest lui-même, copié tel quel dans un registre local.
scan_reference="$SCAN_REGISTRY/$name@$digest"
oras cp --from-oci-layout "$layout@$digest" --to-plain-http "$SCAN_REGISTRY/$name:scan"
resolved="$(oras resolve --plain-http "$SCAN_REGISTRY/$name:scan")"
if [ "$resolved" != "$digest" ]; then
  echo "Digest différent après copie : $resolved au lieu de $digest." >&2
  exit 1
fi

# Rapport complet : toutes les sévérités, vulnérabilités sans correctif comprises.
trivy image --insecure --platform linux/amd64 --scanners vuln \
  --format json --output "$reports_directory/$name.trivy.json" --exit-code 0 "$scan_reference"
# Contrôle bloquant, séparé : critiques et hautes qui ont un correctif. Une erreur du scanner ou
# de sa base fait aussi échouer cette commande.
trivy image --insecure --platform linux/amd64 --scanners vuln --skip-db-update \
  --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 "$scan_reference"

# SBOM et provenance lisibles depuis le registre, tels qu'ils seront publiés. Le gabarit n'écrit
# que des marqueurs de présence : le contenu du SBOM, lui, peut contenir n'importe quel mot.
attestations="$(docker buildx imagetools inspect "$scan_reference" \
  --format '{{if .SBOM.SPDX}}sbom{{end}} {{if .Provenance.SLSA}}provenance{{end}}')"
if [ "$attestations" != "sbom provenance" ]; then
  echo "SBOM ou provenance absent pour $name (trouvé : « $attestations »)." >&2
  exit 1
fi
echo "SBOM et provenance présents pour $name."
