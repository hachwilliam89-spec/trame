#!/usr/bin/env bash
# Charge les images figées de pins.env, puis crée le builder BuildKit à pilote docker-container :
# seul ce pilote exporte un layout OCI qui garde le SBOM et la provenance.
set -euo pipefail

pins="$(dirname "$0")/pins.env"
grep --invert-match --extended-regexp '^(#|$)' "$pins" >> "$GITHUB_ENV"
buildkit_image="$(grep '^BUILDKIT_IMAGE=' "$pins" | cut -d= -f2-)"

docker buildx create --name trame-release --driver docker-container \
  --driver-opt "image=$buildkit_image" --bootstrap
