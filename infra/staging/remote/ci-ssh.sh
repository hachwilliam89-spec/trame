#!/usr/bin/env bash
# Côté GitHub (ADR-0035) : envoie une demande à la commande imposée de la clé de déploiement.
#
#   DEPLOY_KEY=… KNOWN_HOSTS=… infra/staging/remote/ci-ssh.sh "deploy <commit>" | rollback
#
# L'empreinte du VPS est épinglée : aucune première connexion n'est acceptée à l'aveugle. Le code
# de sortie est celui de deploy.sh (README du staging, « Codes de sortie »).
set -euo pipefail

readonly HOST='staging.trame.wkhach.dev'
readonly DEPLOY_USER='trame-deploy'

if [ "$#" -ne 1 ]; then
  echo "Usage : ci-ssh.sh \"deploy <commit>\" | rollback" >&2
  exit 64
fi
: "${DEPLOY_KEY:?Clé de déploiement absente (secret STAGING_DEPLOY_KEY).}"
: "${KNOWN_HOSTS:?Empreinte du VPS absente (secret STAGING_KNOWN_HOSTS).}"

umask 077
directory="$(mktemp -d)"
trap 'rm -rf "$directory"' EXIT
printf '%s\n' "$DEPLOY_KEY" >"$directory/key"
printf '%s\n' "$KNOWN_HOSTS" >"$directory/known_hosts"

ssh -i "$directory/key" \
  -o IdentitiesOnly=yes \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$directory/known_hosts" \
  -o ConnectTimeout=20 \
  -o ServerAliveInterval=30 \
  "$DEPLOY_USER@$HOST" "$1"
