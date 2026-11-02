# `@trame/platform/ids`

Génération d'identifiants derrière un port, pour des tests déterministes.

- `IdGenerator` : le port, `next(): string`.
- `UuidV7Generator` : UUID version 7 (RFC 9562). L'horodatage vient de `Clock`.
  - Un compteur suit l'horodatage (RFC 9562, §6.2, méthode 1) : les identifiants d'une même instance se trient dans leur ordre de création, même à la même milliseconde ou si l'horloge recule. On peut donc paginer par identifiant seul.
  - Entre deux instances de l'API, deux identifiants de la même milliseconde n'ont pas d'ordre garanti.
- `SequentialIdGenerator` : pour les tests, `…-000000000001`, `…-000000000002`, etc.
- `IdsModule` (NestJS, global) : fournit `UuidV7Generator` sous le jeton `ID_GENERATOR`. Nécessite `ClockModule`.
