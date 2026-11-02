# `@trame/platform/ids`

Génération d'identifiants derrière un port, pour des tests déterministes.

- `IdGenerator` : le port, `next(): string`.
- `UuidV7Generator` : UUID version 7 (RFC 9562). Les identifiants se trient dans l'ordre de création, ce qui permet de paginer par identifiant seul. L'horodatage vient de `Clock`.
- `SequentialIdGenerator` : pour les tests, `…-000000000001`, `…-000000000002`, etc.
- `IdsModule` (NestJS, global) : fournit `UuidV7Generator` sous le jeton `ID_GENERATOR`. Nécessite `ClockModule`.
