#!/usr/bin/env bash
# Installe oras, cosign, Trivy et registry dans un dossier du runner, après vérification de
# chaque somme SHA-256. Une somme différente arrête tout : rien n'est installé à moitié.
set -euo pipefail

bin_directory="$RUNNER_TEMP/release-tools/bin"
download_directory="$RUNNER_TEMP/release-tools/downloads"
mkdir -p "$bin_directory" "$download_directory"

# download <url> <fichier> <somme attendue>
download() {
  local url="$1" file="$download_directory/$2" expected_sha256="$3"
  curl --fail --silent --show-error --location --retry 3 --output "$file" "$url"
  echo "$expected_sha256  $file" | sha256sum --check --strict -
}

download "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64" \
  cosign "$COSIGN_SHA256"
install -m 0755 "$download_directory/cosign" "$bin_directory/cosign"

download "https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz" \
  oras.tar.gz "$ORAS_SHA256"
tar --extract --gzip --file "$download_directory/oras.tar.gz" --directory "$bin_directory" oras

download "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
  trivy.tar.gz "$TRIVY_SHA256"
tar --extract --gzip --file "$download_directory/trivy.tar.gz" --directory "$bin_directory" trivy

download "https://github.com/distribution/distribution/releases/download/v${REGISTRY_VERSION}/registry_${REGISTRY_VERSION}_linux_amd64.tar.gz" \
  registry.tar.gz "$REGISTRY_SHA256"
tar --extract --gzip --file "$download_directory/registry.tar.gz" --directory "$bin_directory" registry

echo "$bin_directory" >> "$GITHUB_PATH"
"$bin_directory/cosign" version --json | head -c 200
"$bin_directory/oras" version
"$bin_directory/trivy" --version
"$bin_directory/registry" --version
