#!/usr/bin/env bash
# Déploie sur le staging la version publiée d'un commit de main, ou revient à la version
# précédente (US-005 B2a, étape 3b, #47).
#
#   infra/staging/deploy.sh <commit>     déploie la version publiée de ce commit de main
#   infra/staging/deploy.sh --rollback   revient à la version précédente, de nouveau vérifiée
#
# Lancé sur le VPS, en root, depuis le clone /opt/trame/source. Déroulé, fichiers et codes de
# sortie : infra/staging/README.md.
set -euo pipefail
# Digests, sauvegardes et journaux ne sont lisibles que par root.
umask 077

readonly PROJECT='trame-staging'
readonly PUBLIC_URL='https://staging.trame.wkhach.dev'
readonly EXPECTED_ISSUER='https://auth.trame.wkhach.dev/realms/trame-staging'
readonly WAIT_SECONDS=60
# Contrôles de l'adresse publique : 60 secondes en tout, requêtes et pauses comprises.
readonly PUBLIC_CHECK_MILLISECONDS=60000
readonly PUBLIC_CHECK_INTERVAL_MILLISECONDS=2000
readonly REQUEST_TIMEOUT_MILLISECONDS=10000
readonly SWITCH_MARKER='attempt-restore-point'
DIGEST_VARIABLES=(TRAME_API_DIGEST TRAME_RELAY_DIGEST TRAME_MIGRATOR_DIGEST TRAME_WEB_DIGEST
  TRAME_ENGINE_DIGEST TRAME_WORKER_DIGEST)
readonly DIGEST_VARIABLES
# Le migrator ne tourne qu'à l'étape de migration : seuls ces services sont basculés.
RUNNING_SERVICES=(api relay engine worker web)
readonly RUNNING_SERVICES

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly VERIFIER="$script_directory/../../tools/release-images/verify-release.sh"

# TRAME_ROOT ne sert qu'aux tests : sur le VPS, tout est sous /opt/trame.
readonly root="${TRAME_ROOT:-/opt/trame}"
readonly source_clone="$root/source"
readonly environment_directory="$root/staging"
readonly releases="$environment_directory/releases"
readonly backups="$environment_directory/backups"
readonly secrets="$environment_directory/secrets"

fail() {
  echo "$1" >&2
  exit 1
}

unavailable() {
  echo "Déploiement impossible : $1" >&2
  exit 3
}

usage() {
  echo 'Usage : deploy.sh <commit de 40 caractères hexadécimaux> | deploy.sh --rollback' >&2
  exit 2
}

step() {
  echo "→ $1"
}

if [ "$#" -ne 1 ]; then
  usage
fi
if [ "$1" = '--rollback' ]; then
  readonly mode='rollback'
elif [[ "$1" =~ ^[0-9a-f]{40}$ ]]; then
  readonly mode='deploy'
else
  usage
fi

work_directory="$(mktemp -d)"
readonly work_directory
trap 'rm -rf "$work_directory"' EXIT

# L'échéance des contrôles externes en cours, et le motif du dernier en échec.
check_deadline=0
failed_check=''

# Le motif d'échec d'un outil : sa dernière ligne d'erreur.
last_error_line() {
  tail -n 1 "$work_directory/error"
}

read_state() {
  if [ -f "$releases/$1" ]; then
    cat "$releases/$1"
  fi
}

# Écrit d'un bloc : un fichier d'état n'est jamais lu à moitié écrit.
write_state() {
  printf '%s\n' "$2" >"$releases/$1.partial"
  mv "$releases/$1.partial" "$releases/$1"
}

# Les six digests vérifiés d'une version, une affectation par ligne. Échoue si l'un manque, est
# mal formé ou figure deux fois.
verified_digest_assignments() {
  local variable
  local digest
  for variable in "${DIGEST_VARIABLES[@]}"; do
    digest="$(sed -n "s/^$variable=//p" "$releases/$1.env" 2>/dev/null)" || return 1
    if ! [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      return 1
    fi
    printf '%s=%s\n' "$variable" "$digest"
  done
}

# Docker Compose sur une version : ses digests vérifiés et son propre fichier Compose. Les digests
# passent dans l'environnement de la commande : une variable du même nom exportée dans le shell
# l'emporterait sinon sur --env-file, qui n'empêche plus que la lecture d'un .env voisin.
compose_version() {
  local version="$1"
  shift
  local assignments
  if ! assignments="$(verified_digest_assignments "$version")"; then
    echo "Digests vérifiés de $version illisibles dans $releases/$version.env." >&2
    return 1
  fi
  local environment=()
  local assignment
  while IFS= read -r assignment; do
    environment+=("$assignment")
  done <<<"$assignments"
  env "${environment[@]}" TRAME_SECRETS_DIR="$secrets" docker compose --project-name "$PROJECT" \
    --env-file "$releases/$version.env" \
    --file "$releases/$version/infra/compose/staging.yml" "$@"
}

# Le vérificateur nomme lui-même le défaut d'une version refusée.
verify_release() {
  step "Vérification de la version $1"
  local status=0
  "$VERIFIER" "$1" "$releases/$1.env" || status=$?
  case "$status" in
    0) ;;
    1) fail "Version $1 refusée : rien n'est préchargé, migré ni redémarré." ;;
    *) unavailable "la vérification de la version $1 n'a pas pu aboutir." ;;
  esac
}

# Le clone n'est mis à jour que s'il n'a pas encore ce commit : un retour arrière n'a pas besoin
# du réseau pour ses fichiers.
fetch_commit() {
  local version="$1"
  if git -C "$source_clone" cat-file -e "$version^{commit}" 2>/dev/null; then
    return
  fi
  if ! git -C "$source_clone" fetch --quiet origin main 2>"$work_directory/error"; then
    unavailable "mise à jour du clone impossible : $(last_error_line)"
  fi
  if ! git -C "$source_clone" cat-file -e "$version^{commit}" 2>/dev/null; then
    unavailable "$version absent du clone $source_clone, même mis à jour."
  fi
}

# Les fichiers d'infrastructure du commit vérifié : images et Compose viennent du même commit.
extract_release_files() {
  local version="$1"
  local directory="$releases/$version"
  if [ -d "$directory" ]; then
    return
  fi
  step "Extraction des fichiers de $version"
  fetch_commit "$version"
  if ! git -C "$source_clone" archive --output "$work_directory/files.tar" "$version" \
    infra/compose/staging.yml 2>/dev/null; then
    fail "infra/compose/staging.yml absent du commit $version : rien n'est préchargé, migré \
ni redémarré."
  fi
  rm -rf "$directory.partial"
  mkdir "$directory.partial"
  tar -xf "$work_directory/files.tar" -C "$directory.partial"
  mv "$directory.partial" "$directory"
}

pull_images() {
  step "Préchargement des images de $1"
  if ! compose_version "$1" pull --quiet; then
    fail "Préchargement des images de $1 en échec : rien n'est migré ni redémarré."
  fi
}

# Le conteneur PostgreSQL de la stack partagée, trouvé par ses étiquettes Compose : sans fichier
# Compose, `docker compose exec` lirait celui du dossier courant, s'il y en a un.
find_shared_postgres() {
  local container
  container="$(docker ps --quiet --filter label=com.docker.compose.project=trame-shared \
    --filter label=com.docker.compose.service=postgres)" || return 1
  [ -n "$container" ] || return 1
  printf '%s' "$container"
}

# Un filet local avant la migration, en attendant la sauvegarde chiffrée hors du VPS (US-008).
back_up_database() {
  step 'Sauvegarde de trame_staging'
  local container
  if ! container="$(find_shared_postgres)"; then
    fail "PostgreSQL de trame-shared introuvable : rien n'est migré ni redémarré."
  fi
  local backup
  backup="$backups/trame_staging-$(date -u +%Y%m%dT%H%M%SZ)-avant-${1:0:12}.dump"
  if ! docker exec "$container" pg_dump --username postgres --dbname trame_staging \
    --format custom >"$backup.partial"; then
    rm -f "$backup.partial"
    fail "Sauvegarde de trame_staging en échec : rien n'est migré ni redémarré."
  fi
  mv "$backup.partial" "$backup"
  echo "Sauvegarde : $backup"
}

# Avant la bascule, et à part : lancée par `up`, une migration en échec laisserait déjà recréés
# les services qui n'en dépendent pas.
migrate_database() {
  step "Migration de trame_staging vers $1"
  if ! compose_version "$1" run --rm --no-deps migrator; then
    fail "Migration vers $1 en échec : les services restent sur la version en service. \
Procédure : infra/staging/README.md."
  fi
}

start_services() {
  compose_version "$1" up --detach --wait --wait-timeout "$WAIT_SECONDS" --no-deps \
    --remove-orphans "${RUNNING_SERVICES[@]}"
}

# Les services d'une version qui ne tournent pas, ou pas sains, avec leur état.
describe_failing_services() {
  local service state health
  local description=''
  while IFS=$'\t' read -r service state health; do
    if [ "$state" = running ] && [ "$health" != unhealthy ] && [ "$health" != starting ]; then
      continue
    fi
    description+="${description:+, }$service ($state${health:+, $health})"
  done < <(compose_version "$1" ps --all --format '{{.Service}}\t{{.State}}\t{{.Health}}' \
    2>/dev/null)
  printf '%s' "${description:-aucun service en échec identifié}"
}

# L'horloge monotone du système (CLOCK_MONOTONIC), en millisecondes : un réglage de l'heure ne
# raccourcit ni n'allonge l'attente. Bash n'en a pas : chaque lecture passe par python3.
monotonic_milliseconds() {
  python3 -I -c 'import time; print(int(time.clock_gettime(time.CLOCK_MONOTONIC) * 1000))'
}

milliseconds_left() {
  local now
  now="$(monotonic_milliseconds)"
  echo $((check_deadline - now))
}

# 6000 devient 6.000 : curl et sleep acceptent des secondes décimales.
as_seconds() {
  printf '%d.%03d' $(($1 / 1000)) $(($1 % 1000))
}

# Code de sortie 0 si la réponse a le statut et le type de contenu attendus ; sinon, le motif
# est dans failed_check. La requête ne dépasse pas l'échéance des contrôles.
expect_response() {
  local url="$1"
  local expected_status="$2"
  local expected_type="${3:-}"
  local timeout
  timeout="$(milliseconds_left)"
  if [ "$timeout" -le 0 ]; then
    failed_check="$url non contrôlée : délai écoulé."
    return 1
  fi
  if [ "$timeout" -gt "$REQUEST_TIMEOUT_MILLISECONDS" ]; then
    timeout="$REQUEST_TIMEOUT_MILLISECONDS"
  fi
  local outcome
  if ! outcome="$(curl --silent --show-error --proto '=https' --max-time "$(as_seconds "$timeout")" \
    --output "$work_directory/body" --write-out '%{http_code} %{content_type}' "$url" \
    2>"$work_directory/error")"; then
    failed_check="$url injoignable : $(last_error_line)"
    return 1
  fi
  local status="${outcome%% *}"
  local content_type="${outcome#* }"
  if [ "$status" != "$expected_status" ]; then
    failed_check="$url répond $status, $expected_status attendu."
    return 1
  fi
  if [ -n "$expected_type" ] && [[ "$content_type" != "$expected_type"* ]]; then
    failed_check="$url répond en ${content_type:-type absent}, $expected_type attendu."
    return 1
  fi
}

expect_issuer() {
  expect_response "$EXPECTED_ISSUER/.well-known/openid-configuration" 200 application/json ||
    return 1
  local issuer
  issuer="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1], "rb"))["issuer"])' \
    "$work_directory/body" 2>/dev/null)" || issuer=''
  if [ "$issuer" != "$EXPECTED_ISSUER" ]; then
    failed_check="Émetteur annoncé : ${issuer:-absent}, $EXPECTED_ISSUER attendu."
    return 1
  fi
}

check_public_address() {
  expect_response "$PUBLIC_URL/health" 200 &&
    expect_response "$PUBLIC_URL/api/v1/health/ready" 200 &&
    expect_response "$PUBLIC_URL/api/v1/sites" 401 application/problem+json &&
    expect_issuer
}

# Traefik doit découvrir les conteneurs recréés et, au premier déploiement, obtenir les
# certificats : l'adresse publique peut mettre quelques secondes à répondre. Une pause n'a lieu
# que s'il reste ensuite du temps pour un nouvel essai.
wait_for_public_address() {
  step "Contrôle de $PUBLIC_URL"
  local now
  now="$(monotonic_milliseconds)"
  check_deadline=$((now + PUBLIC_CHECK_MILLISECONDS))
  while ! check_public_address; do
    if [ "$(milliseconds_left)" -le "$PUBLIC_CHECK_INTERVAL_MILLISECONDS" ]; then
      return 1
    fi
    sleep "$(as_seconds "$PUBLIC_CHECK_INTERVAL_MILLISECONDS")"
  done
}

# Le point de restauration de la tentative est noté juste avant la bascule, et retiré une fois
# son issue connue. Présent au lancement, il signale une bascule interrompue.
mark_switch() {
  write_state "$SWITCH_MARKER" "${1:-aucune}"
}

clear_switch_marker() {
  rm -f "$releases/$SWITCH_MARKER"
}

warn_if_switch_interrupted() {
  local marker
  marker="$(read_state "$SWITCH_MARKER")"
  if [ -n "$marker" ]; then
    echo "Une bascule précédente s'est interrompue (point de restauration : $marker) :" \
      "l'état des services est incertain." >&2
  fi
}

# Les recréer efface les journaux des conteneurs en échec : ils sont gardés avant le retour.
save_failure_logs() {
  local log="$releases/$1.failure.log"
  if compose_version "$1" logs --no-color --timestamps --tail 500 "${RUNNING_SERVICES[@]}" \
    >"$log" 2>&1; then
    echo "Journaux de $1 : $log" >&2
  else
    echo "Journaux de $1 illisibles." >&2
  fi
}

# Le script ne peut pas rétablir seul un état sûr : le marqueur de bascule reste en place, et le
# déploiement suivant le signale.
intervention_required() {
  echo "$1 Intervention requise (infra/staging/README.md)." >&2
  exit 4
}

# Premier déploiement : il n'y a rien à restaurer. Seuls les services du staging sont arrêtés,
# avec leurs conteneurs gardés pour le diagnostic ; volumes et stack partagée ne sont pas touchés.
stop_first_version() {
  if ! compose_version "$1" stop; then
    intervention_required 'Arrêt des services du staging en échec.'
  fi
  clear_switch_marker
  fail "Premier déploiement en échec : services du staging arrêtés. Volumes, données et stack \
partagée intacts."
}

# Retire la version en échec : retour à la version en service au début de la tentative, et non à
# la précédente (si A est en service, B avant elle, et que C échoue, c'est A qui revient). Elle a
# déjà été contrôlée, mais l'est de nouveau : on ne la déclare en service que si elle répond.
withdraw_version() {
  local failed="$1"
  local restore_point="$2"
  save_failure_logs "$failed"
  if [ -z "$restore_point" ]; then
    stop_first_version "$failed"
  fi
  step "Retour à $restore_point"
  if ! start_services "$restore_point"; then
    intervention_required \
      "Retour à $restore_point en échec : $(describe_failing_services "$restore_point")."
  fi
  if ! wait_for_public_address; then
    intervention_required "Retour à $restore_point : adresse publique toujours en échec pendant \
$((PUBLIC_CHECK_MILLISECONDS / 1000)) secondes : $failed_check"
  fi
  clear_switch_marker
  fail "Version $failed retirée : $restore_point de nouveau en service."
}

switch_to() {
  local version="$1"
  local restore_point="$2"
  mark_switch "$restore_point"
  step "Bascule des services vers $version"
  if ! start_services "$version"; then
    echo "Bascule vers $version en échec : $(describe_failing_services "$version")." >&2
    withdraw_version "$version" "$restore_point"
  fi
  if ! wait_for_public_address; then
    echo "Contrôle de l'adresse publique en échec pendant $((PUBLIC_CHECK_MILLISECONDS / 1000))" \
      "secondes : $failed_check" >&2
    withdraw_version "$version" "$restore_point"
  fi
}

# Redéployer la version en service ne change pas la version précédente.
record_success() {
  local version="$1"
  local restore_point="$2"
  if [ -n "$restore_point" ] && [ "$restore_point" != "$version" ]; then
    write_state previous "$restore_point"
  fi
  write_state current "$version"
  clear_switch_marker
  echo "Version $version en service sur le staging."
}

check_host() {
  local tool
  for tool in docker git tar curl python3; do
    if ! command -v "$tool" >/dev/null; then
      unavailable "$tool introuvable."
    fi
  done
  local directory
  for directory in "$source_clone" "$secrets"; do
    if [ ! -d "$directory" ]; then
      unavailable "$directory introuvable (runbook du staging)."
    fi
  done
}

# Le verrou tient tant que le descripteur 9 reste ouvert : jusqu'à la fin du script, et de ses
# processus encore en cours. Python plutôt que flock(1), absent de macOS où les tests tournent.
take_deploy_lock() {
  exec 9>>"$environment_directory/deploy.lock"
  if ! python3 -I -c 'import fcntl; fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)' 2>/dev/null; then
    unavailable 'un autre déploiement est en cours.'
  fi
}

# Un retour à la version en service doit rester possible pendant toute la tentative.
check_restorable() {
  if [ -z "$1" ]; then
    return
  fi
  if ! verified_digest_assignments "$1" >/dev/null ||
    [ ! -f "$releases/$1/infra/compose/staging.yml" ]; then
    unavailable "point de restauration $1 incomplet dans $releases."
  fi
}

check_host
take_deploy_lock
mkdir -p "$releases" "$backups"
warn_if_switch_interrupted
restore_point="$(read_state current)"
if [ "$mode" = 'rollback' ]; then
  version="$(read_state previous)"
  if [ -z "$version" ]; then
    fail 'Aucune version précédente : retour arrière impossible.'
  fi
else
  version="$1"
fi
check_restorable "$restore_point"
verify_release "$version"
extract_release_files "$version"
pull_images "$version"
# Pas de migration descendante au retour arrière : l'expand/contract (ADR-0022) garantit que la
# version précédente fonctionne sur le schéma migré.
if [ "$mode" = 'deploy' ]; then
  back_up_database "$version"
  migrate_database "$version"
fi
switch_to "$version" "$restore_point"
record_success "$version" "$restore_point"
