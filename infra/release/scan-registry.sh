#!/usr/bin/env bash
# Démarre le registre local éphémère du scan (distribution), sur 127.0.0.1:5000, en HTTP.
# Il ne vit que le temps du job : rien n'y est publié.
set -euo pipefail

storage="$RUNNER_TEMP/scan-registry"
mkdir -p "$storage"
cat > "$RUNNER_TEMP/scan-registry.yml" <<CONFIG
version: 0.1
storage:
  filesystem:
    rootdirectory: $storage
http:
  addr: 127.0.0.1:5000
CONFIG
nohup registry serve "$RUNNER_TEMP/scan-registry.yml" > "$RUNNER_TEMP/scan-registry.log" 2>&1 &

for attempt in $(seq 1 20); do
  if curl --silent --fail http://127.0.0.1:5000/v2/ > /dev/null; then
    echo "Registre local prêt (essai $attempt)."
    exit 0
  fi
  sleep 1
done
echo "Le registre local n'a pas démarré :" >&2
cat "$RUNNER_TEMP/scan-registry.log" >&2
exit 1
