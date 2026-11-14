#!/usr/bin/env bash
# Donne au realm master de Keycloak l'adresse du tunnel d'administration (US-005 B2a, #47, ADR-0034).
#
#   docker exec -i <conteneur keycloak> bash -s < infra/provisioning/keycloak-master-realm.sh
#
# La console d'administration n'est pas routée par Traefik : elle s'ouvre par le tunnel SSH, à
# l'adresse KC_HOSTNAME_ADMIN. Mais elle authentifie son utilisateur à l'adresse du realm master,
# par défaut l'adresse publique (KC_HOSTNAME), où ce realm n'est pas routé non plus. Le realm
# master reçoit donc pour adresse (« Frontend URL ») celle du tunnel : sa page de connexion et ses
# jetons n'existent plus que par le tunnel.
#
# Lancé une fois, après le premier démarrage de Keycloak, avec le compte d'administration
# temporaire que le conteneur tient de son environnement (KC_BOOTSTRAP_ADMIN_*) : aucune variable
# à passer. Rejouable tant que ce compte existe. Silencieux quand tout réussit.
set -euo pipefail

: "${KC_HOSTNAME_ADMIN:?}" "${KC_BOOTSTRAP_ADMIN_USERNAME:?}" "${KC_BOOTSTRAP_ADMIN_PASSWORD:?}"

# kcadm garde son jeton dans ce fichier, sur le tmpfs du conteneur ; il est retiré à la fin.
session_file="/tmp/kcadm-$$.config"
readonly session_file
trap 'rm -f "$session_file"' EXIT

# Rend la sortie de kcadm seulement s'il échoue.
quiet_unless_failed() {
  local output
  if ! output="$("$@" 2>&1)"; then
    echo "$output" >&2
    return 1
  fi
}

# Le mot de passe passe par l'environnement et par l'entrée standard, jamais en argument, visible
# par `ps`. Les deux voies : selon sa version, kcadm lit l'une ou l'autre, et sans la seconde il
# prendrait pour mot de passe la suite de ce script, qui arrive aussi sur l'entrée standard.
log_in() {
  printf '%s\n' "$KC_BOOTSTRAP_ADMIN_PASSWORD" |
    KC_CLI_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD" /opt/keycloak/bin/kcadm.sh config credentials \
      --config "$session_file" --server http://127.0.0.1:8080 --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME"
}

# kcadm relit le realm, n'y change que cet attribut, puis le renvoie entier.
set_master_address() {
  /opt/keycloak/bin/kcadm.sh update realms/master --config "$session_file" \
    --set "attributes.frontendUrl=$KC_HOSTNAME_ADMIN" </dev/null
}

quiet_unless_failed log_in
quiet_unless_failed set_master_address
