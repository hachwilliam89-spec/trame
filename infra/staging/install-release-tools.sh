#!/usr/bin/env bash
# Installe oras et cosign, dont verify-release.sh a besoin sur le VPS (US-005 B2a, étape 4, #47).
#
#   sudo infra/staging/install-release-tools.sh [dossier]     # /usr/local/bin par défaut
#
# Versions et sommes SHA-256 égales à celles de la CI qui publie et signe les versions
# (.github/actions/release-tools), ce que vérifie infra/src/release-tools.spec.ts. Une somme
# différente arrête tout : rien n'est installé. Linux amd64 uniquement, comme le VPS.
set -euo pipefail

readonly COSIGN_VERSION='v3.1.4'
readonly COSIGN_SHA256='424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa'
readonly ORAS_VERSION='1.3.6'
readonly ORAS_SHA256='66fb0ad7206f3f6fa77ed5b552049d364ccf4b50b1684554f731f76302b52ca0'

readonly target_directory="${1:-/usr/local/bin}"

if [ "$(uname -s)-$(uname -m)" != 'Linux-x86_64' ]; then
  echo "Plateforme non prise en charge : $(uname -s)-$(uname -m) (Linux x86_64 attendu)." >&2
  exit 2
fi

download_directory="$(mktemp -d)"
readonly download_directory
trap 'rm -rf "$download_directory"' EXIT

# download <url> <fichier> <somme attendue>
download() {
  local file="$download_directory/$2"
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --output "$file" "$1"
  echo "$3  $file" | sha256sum --check --strict --quiet -
}

download "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64" \
  cosign "$COSIGN_SHA256"
download "https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz" \
  oras.tar.gz "$ORAS_SHA256"
tar --extract --gzip --file "$download_directory/oras.tar.gz" --directory "$download_directory" oras

# Les deux sommes sont vérifiées avant toute installation.
mkdir -p "$target_directory"
install -m 0755 "$download_directory/cosign" "$target_directory/cosign"
install -m 0755 "$download_directory/oras" "$target_directory/oras"
echo "Installés dans $target_directory : cosign $COSIGN_VERSION, oras $ORAS_VERSION."
