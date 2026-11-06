#!/bin/sh
# Provisionne la messagerie d'un environnement déployé de Trame (US-005 B2a, #47) : le vhost
# trame-<environnement>, et les utilisateurs trame_<environnement>_relay et
# trame_<environnement>_worker, limités à ce vhost et aux ressources de la topologie de diagnostic.
#
# Lancé dans le conteneur RabbitMQ, le script arrivant sur l'entrée standard :
#   docker compose exec -T -e TRAME_ENVIRONMENT=staging -e TRAME_RELAY_PASSWORD \
#     -e TRAME_WORKER_PASSWORD rabbitmq sh -s < infra/provisioning/rabbitmq-environment.sh
# Les mots de passe ne passent que par l'environnement. Rejouable : il crée ce qui manque, puis
# réaligne mots de passe, rôles et permissions.
set -eu

fail() {
  echo "$1" >&2
  exit 2
}

# Le script lui-même arrive sur l'entrée standard : aucune commande ne doit la lire.
ctl() {
  rabbitmqctl --silent "$@" </dev/null
}

environment="${TRAME_ENVIRONMENT:-}"
case "$environment" in
  staging | production) ;;
  *) fail 'TRAME_ENVIRONMENT doit valoir staging ou production.' ;;
esac
[ -n "${TRAME_RELAY_PASSWORD:-}" ] || fail 'TRAME_RELAY_PASSWORD manquant.'
[ -n "${TRAME_WORKER_PASSWORD:-}" ] || fail 'TRAME_WORKER_PASSWORD manquant.'

vhost="trame-$environment"

# Le relay et le worker déclarent chacun toute la topologie (infra/rabbitmq/diagnostic-topology.json).
# RabbitMQ exige la lecture d'une file créée avec une file de rebut, et c'est le premier démarré qui
# la crée : les deux reçoivent donc les mêmes droits, sur les seules ressources de diagnostic.
diagnostic_resources='^trame\.diagnostic\.'

ensure_vhost() {
  if ! ctl list_vhosts name | grep -qx "$vhost"; then
    ctl add_vhost "$vhost"
  fi
}

# Le mot de passe est lu sur l'entrée standard, jamais passé en argument (visible par `ps`). Le
# script `rabbitmqctl` ne lit cette entrée que pour exactement deux arguments : aucune option ici.
set_password() {
  user="$1"
  password="$2"
  if ctl list_users | cut -f1 | grep -qx "$user"; then
    printf '%s\n' "$password" | rabbitmqctl change_password "$user" >/dev/null
  else
    printf '%s\n' "$password" | rabbitmqctl add_user "$user" >/dev/null
  fi
}

revoke_other_vhosts() {
  user="$1"
  for granted_vhost in $(ctl list_user_permissions "$user" | cut -f1); do
    if [ "$granted_vhost" != "$vhost" ]; then
      ctl clear_permissions -p "$granted_vhost" "$user"
    fi
  done
}

ensure_service_user() {
  user="trame_${environment}_$1"
  set_password "$user" "$2"
  # Aucun rôle : ni interface de gestion, ni administration.
  ctl set_user_tags "$user"
  revoke_other_vhosts "$user"
  ctl set_permissions -p "$vhost" "$user" \
    "$diagnostic_resources" "$diagnostic_resources" "$diagnostic_resources"
}

ensure_vhost
ensure_service_user relay "$TRAME_RELAY_PASSWORD"
ensure_service_user worker "$TRAME_WORKER_PASSWORD"
