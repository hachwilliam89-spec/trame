#!/usr/bin/env bash
# Après un déploiement par GitHub (ADR-0035) : le staging répond, son realm aussi, et le realm
# master comme la console d'administration restent fermés à Internet (tunnel SSH seulement).
set -euo pipefail

readonly PUBLIC_URL='https://staging.trame.wkhach.dev'
readonly AUTH_URL='https://auth.trame.wkhach.dev'

status_of() {
  curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 --retry 3 \
    --retry-all-errors "$1"
}

expect_status() {
  local url="$1" expected="$2" actual
  actual="$(status_of "$url")"
  if [ "$actual" != "$expected" ]; then
    echo "$url : $actual reçu, $expected attendu." >&2
    return 1
  fi
  echo "$url : $actual"
}

failures=0
expect_status "$PUBLIC_URL/" 200 || failures=$((failures + 1))
expect_status "$AUTH_URL/realms/trame-staging/.well-known/openid-configuration" 200 ||
  failures=$((failures + 1))
expect_status "$AUTH_URL/realms/master/.well-known/openid-configuration" 404 ||
  failures=$((failures + 1))
expect_status "$AUTH_URL/admin/master/console/" 404 || failures=$((failures + 1))
exit "$((failures > 0))"
