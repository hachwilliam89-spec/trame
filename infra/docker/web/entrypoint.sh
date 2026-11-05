#!/bin/sh
set -eu

invalid() {
  printf '%s\n' 'trame_web_configuration_invalid' >&2
  exit 1
}

# Liste fermée : les valeurs vont dans JSON, jamais dans une directive nginx.
# Pas de credentials, chemin, query string ou caractères à échapper dans une origine OIDC.
origin=${WEB_AUTH_SERVER_URL:-}
printf '%s' "$origin" | LC_ALL=C grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$|^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$' || invalid
for identifier in "${WEB_AUTH_REALM:-}" "${WEB_AUTH_CLIENT_ID:-}"; do
  case "$identifier" in
    ''|*[!A-Za-z0-9._-]*) invalid ;;
  esac
done
# grep travaille par ligne : refuser explicitement les retours à la ligne avant interpolation.
case "$origin" in
  *'
'*) invalid ;;
esac

runtime_directory=${WEB_RUNTIME_DIR:-/tmp/trame}
mkdir -p "$runtime_directory"
umask 077
printf '{"apiBasePath":"/api/v1","authServerUrl":"%s","realm":"%s","clientId":"%s"}\n' \
  "$origin" "$WEB_AUTH_REALM" "$WEB_AUTH_CLIENT_ID" > "$runtime_directory/config.json"
exec "$@"
