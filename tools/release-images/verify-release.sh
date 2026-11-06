#!/usr/bin/env bash
# Vérifie la version publiée d'un commit, sur le VPS et sans Node (US-005 B2a, étape 3b, #47).
#
# Portage shell de `release-images verify` : même politique (src/lib/policy.ts), mêmes refus et
# mêmes messages. src/lib/shell-verifier.spec.ts le prouve, en vérifiant aussi les arguments exacts
# passés à cosign, pour que ces constantes ne puissent pas être déclarées sans être appliquées.
#
#   tools/release-images/verify-release.sh <commit> <fichier des digests>
#
# Une fois le manifeste de version et les six images vérifiés, écrit TRAME_<IMAGE>_DIGEST=sha256:…
# pour chaque image : ce sont les seules références que lit infra/compose/staging.yml.
# Codes de sortie : 0 vérifiée, 1 refusée, 2 usage, 3 vérification impossible (outil absent).
set -euo pipefail

# Politique : ces valeurs ne viennent jamais du manifeste vérifié ni de l'environnement.
readonly GITHUB_REPOSITORY='hachwilliam89-spec/trame'
readonly IMAGE_NAMES='api relay migrator web engine worker'
readonly IMAGE_REPOSITORY_PREFIX='ghcr.io/hachwilliam89-spec/trame-'
readonly RELEASE_REPOSITORY='ghcr.io/hachwilliam89-spec/trame-release'
readonly SIGNER_IDENTITY="https://github.com/${GITHUB_REPOSITORY}/.github/workflows/publish-images.yml@refs/heads/main"
readonly OIDC_ISSUER='https://token.actions.githubusercontent.com'

refuse() {
  echo "$1" >&2
  exit 1
}

unavailable() {
  echo "Vérification impossible : $1" >&2
  exit 3
}

if [ "$#" -ne 2 ] || ! [[ "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Usage : verify-release.sh <commit de 40 caractères hexadécimaux> <fichier des digests>' >&2
  exit 2
fi
readonly commit="$1"
readonly digests_file="$2"

for tool in oras cosign python3; do
  if ! command -v "$tool" >/dev/null; then
    unavailable "$tool introuvable. Installer oras, cosign et python3 (infra/docker/README.md)."
  fi
done

work_directory="$(mktemp -d)"
readonly work_directory
trap 'rm -rf "$work_directory"' EXIT

# Le motif d'échec d'un outil : sa dernière ligne d'erreur.
last_error_line() {
  tail -n 1 "$work_directory/error"
}

verify_signature() {
  local reference="$1"
  local subject="$2"
  if ! cosign verify \
    --certificate-identity "$SIGNER_IDENTITY" \
    --certificate-oidc-issuer "$OIDC_ISSUER" \
    --certificate-github-workflow-repository "$GITHUB_REPOSITORY" \
    --certificate-github-workflow-ref refs/heads/main \
    --certificate-github-workflow-sha "$commit" \
    -a "commit=$commit" \
    "$reference" >/dev/null 2>"$work_directory/error"; then
    refuse "Signature refusée pour $subject : $(last_error_line)"
  fi
}

# Le tag est résolu une seule fois : la signature est vérifiée sur ce digest, puis ce même digest
# est téléchargé. Relire le tag laisserait le temps de le faire pointer ailleurs.
resolve_release_digest() {
  local output
  if ! output="$(oras resolve "$RELEASE_REPOSITORY:$commit" 2>"$work_directory/error")"; then
    refuse "Manifeste de version introuvable pour $commit : $(last_error_line)"
  fi
  output="$(printf '%s' "$output" | tr -d '[:space:]')"
  if ! [[ "$output" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    refuse "Digest du manifeste de version mal formé : $output."
  fi
  printf '%s' "$output"
}

# Lit images.json et le refuse au moindre écart, avec les messages de src/lib/release-manifest.ts.
# Rend une ligne « nom référence » par image. Python en mode isolé : il ignore l'environnement.
read_manifest_images() {
  python3 -I - "$commit" "$IMAGE_NAMES" "$IMAGE_REPOSITORY_PREFIX" "$1" <<'PYTHON'
import json
import re
import sys

expected_commit, names_text, repository_prefix, manifest_path = sys.argv[1:5]
known_names = names_text.split()
shape_message = "images.json n’a pas la forme attendue : { commit, images: [{ name, reference }] }."


def refuse(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def has_exact_text_keys(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        return False
    return all(isinstance(value[key], str) for key in keys if key != "images")


with open(manifest_path, encoding="utf-8") as manifest_file:
    text = manifest_file.read()
if text.strip() == "":
    refuse("images.json est vide.")
try:
    manifest = json.loads(text)
except ValueError:
    refuse("images.json n’est pas un JSON valide.")

if not has_exact_text_keys(manifest, ["commit", "images"]) or not isinstance(manifest["images"], list):
    refuse(shape_message)
for image in manifest["images"]:
    if not has_exact_text_keys(image, ["name", "reference"]):
        refuse(shape_message)

commit = manifest["commit"]
if not re.fullmatch(r"[0-9a-f]{40}", commit):
    refuse(f"Commit mal formé : {commit} (40 caractères hexadécimaux attendus).")
if commit != expected_commit:
    refuse(f"images.json porte le commit {commit}, attendu {expected_commit}.")

seen_names = []
for image in manifest["images"]:
    name, reference = image["name"], image["reference"]
    if name not in known_names:
        refuse(f"Image inconnue : {name}.")
    if name in seen_names:
        refuse(f"Image en double : {name}.")
    seen_names.append(name)
    repository = repository_prefix + name
    if not (reference.startswith(repository + "@") or reference.startswith(repository + ":")):
        refuse(f"Dépôt inattendu pour {name} : {reference}.")
    if not re.fullmatch(r"@sha256:[0-9a-f]{64}", reference[len(repository):]):
        refuse(
            f"Digest mal formé pour {name} : {reference} "
            "(sha256 suivi de 64 caractères hexadécimaux attendu)."
        )
for name in known_names:
    if name not in seen_names:
        refuse(f"Image manquante : {name}.")
for image in manifest["images"]:
    print(image["name"], image["reference"])
PYTHON
}

release_digest="$(resolve_release_digest)"
readonly release_reference="$RELEASE_REPOSITORY@$release_digest"
verify_signature "$release_reference" 'le manifeste de version'

mkdir "$work_directory/release"
if ! oras pull "$release_reference" -o "$work_directory/release" >/dev/null 2>"$work_directory/error"; then
  refuse "Manifeste de version illisible : $(last_error_line)"
fi
images="$(read_manifest_images "$work_directory/release/images.json")"

digests=''
while read -r name reference; do
  verify_signature "$reference" "$name"
  # tr plutôt que ${name^^}, absent du bash 3.2 de macOS.
  variable="TRAME_$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')_DIGEST"
  digests+="$variable=${reference#*@}"$'\n'
done <<<"$images"

# Écrit d'un bloc : un fichier de digests n'existe que pour une version entièrement vérifiée.
printf '%s' "$digests" >"$digests_file.partial"
mv "$digests_file.partial" "$digests_file"
echo "Version $commit vérifiée : manifeste et six images signés pour ce commit."
