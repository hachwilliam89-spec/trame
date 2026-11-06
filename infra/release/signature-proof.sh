#!/usr/bin/env bash
# Preuve de la CI, sur le registre local : signer un digest avec l'annotation du commit, le
# vérifier, refuser un autre commit, et le lire sans identifiant.
#
#   signature-proof.sh <référence@digest> <commit>
#
# La CI signe avec une clé jetable : la signature sans clé n'existe que sur main (jeton OIDC).
set -euo pipefail

reference="$1" commit="$2"
key_directory="$(mktemp -d)"
export COSIGN_PASSWORD='' COSIGN_YES=true
(cd "$key_directory" && cosign generate-key-pair > /dev/null)

cosign sign --key "$key_directory/cosign.key" --allow-http-registry \
  --use-signing-config=false --tlog-upload=false -a "commit=$commit" "$reference"

cosign verify --key "$key_directory/cosign.pub" --allow-http-registry --insecure-ignore-tlog \
  -a "commit=$commit" "$reference" > /dev/null
echo "Signature vérifiée pour le commit $commit."

if cosign verify --key "$key_directory/cosign.pub" --allow-http-registry --insecure-ignore-tlog \
  -a "commit=0000000000000000000000000000000000000000" "$reference" > /dev/null 2>&1; then
  echo "Une signature d'un autre commit a été acceptée." >&2
  exit 1
fi
echo "Signature refusée pour un autre commit, comme attendu."

anonymous_config="$key_directory/anonymous.json"
echo '{}' > "$anonymous_config"
oras manifest fetch --plain-http --registry-config "$anonymous_config" --descriptor "$reference" > /dev/null
echo "Lecture anonyme du digest réussie."
