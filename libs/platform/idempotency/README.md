# Idempotence

`IdempotencyKey.of(value)` valide une clé opaque de 1 à 128 caractères ASCII visibles,
sans espace. Elle conserve exactement sa valeur ; une entrée invalide lève
`InvalidIdempotencyKeyError`. Aucune configuration ni dépendance métier.

La validation de la clé ne garantit pas à elle seule l'idempotence : le consommateur doit
la conserver avec la réponse ou la ressource, dans une portée explicite, et arbitrer les
requêtes concurrentes en base. Le diagnostic de scheduling utilise organisation + opération
(table dédiée) + clé, sans expiration tant que le job est conservé.

Tests : `pnpm nx run platform-idempotency:test`.
