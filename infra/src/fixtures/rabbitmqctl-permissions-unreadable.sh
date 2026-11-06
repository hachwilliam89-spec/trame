#!/bin/sh
# Faux rabbitmqctl des tests de provisionnement, placé avant le vrai dans le PATH : seule la
# lecture des permissions d'un utilisateur échoue, toutes les autres commandes passent au vrai.
case "$*" in
  *list_user_permissions*)
    echo 'panne simulée de list_user_permissions' >&2
    exit 70
    ;;
esac
exec "$RABBITMQ_HOME/sbin/rabbitmqctl" "$@"
