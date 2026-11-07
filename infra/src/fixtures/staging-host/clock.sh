# shellcheck shell=bash
# Horloge simulée du banc de déploiement, partagée par les faux curl et sleep : un nombre de
# millisecondes dans $FAKE_STATE/clock, que lit le faux python3 à la place de l'horloge monotone.

# Durée en secondes décimales (« 2 », « 6.000 ») vers des millisecondes.
milliseconds_of() {
  local whole="${1%%.*}"
  local fraction='000'
  if [[ "$1" == *.* ]]; then
    fraction="${1#*.}000"
    fraction="${fraction:0:3}"
  fi
  echo $((10#$whole * 1000 + 10#$fraction))
}

advance_clock_by_milliseconds() {
  local now
  now="$(cat "$FAKE_STATE/clock")"
  echo $((now + $1)) >"$FAKE_STATE/clock"
}
