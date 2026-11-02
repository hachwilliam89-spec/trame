# Contexte `organization` (module de référence)

Sites et créneaux types (US-030). Compétences et postes arrivent avec la PR B.

C'est le **module de référence** (AGENTS.md) : tout nouveau contexte reproduit cette structure, ces conventions et ces types de tests.

## Les trois couches

| Lib                              | Contenu                                               | Dépend de                                      |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `@trame/api/organization/domain` | agrégats, value objects, erreurs métier. TS pur.      | rien (Temporal et Intl sont natifs)            |
| `…/application`                  | use cases, ports des dépôts, erreurs « introuvable ». | `domain`, `platform` (horloge, ids, pages)     |
| `…/infrastructure`               | dépôts Prisma, contrôleurs REST, module Nest.         | les deux, `api/database`, `platform`, contrats |

- **Domaine** : `Site` (code unique dans l'organisation, fuseau IANA) et `ShiftTemplate` (heures locales, pause positionnée, durées réelles à une date). Un agrégat se construit par `create()`, qui vérifie ses règles, qu'il soit nouveau ou relu en base. Les erreurs héritent de `DomainError` : leur message s'adresse à l'utilisateur, en français, et l'API le renvoie tel quel.
- **Application** : un use case par classe, sans décorateur, avec une méthode `execute()`. Il reçoit l'`organizationId` en paramètre et ne connaît ni HTTP ni l'utilisateur. Les règles qui demandent de voir les autres agrégats (unicité du code) sont vérifiées ici.
- **Infrastructure** :
  - le module Nest assemble les use cases avec leurs dépendances (`useFactory`) ;
  - les contrôleurs valident l'entrée avec les contrats zod, prennent l'organisation de l'utilisateur authentifié, jamais de la requête, et traduisent les erreurs par `organizationErrorMappings` ;
  - les dépôts Prisma filtrent chaque lecture sur l'organisation, et traduisent une violation d'unicité (création simultanée) en erreur métier.

## Endpoints

| Méthode et chemin (`/api/v1`)                                        | Rôles          | Réponses                     |
| -------------------------------------------------------------------- | -------------- | ---------------------------- |
| `POST /sites`                                                        | admin          | 201, 400, 401, 403, 409      |
| `GET /sites?limit=&cursor=`                                          | admin, manager | 200, 400, 401, 403           |
| `GET /sites/{siteId}`                                                | admin, manager | 200, 401, 403, 404           |
| `POST /sites/{siteId}/shift-templates`                               | admin          | 201, 400, 401, 403, 404, 409 |
| `GET /sites/{siteId}/shift-templates?limit=&cursor=`                 | admin, manager | 200, 400, 401, 403, 404      |
| `GET /sites/{siteId}/shift-templates/{id}/durations?date=AAAA-MM-JJ` | admin, manager | 200, 400, 401, 403, 404      |

- Une ressource d'une autre organisation répond 404, exactement comme une ressource absente.
- Un identifiant mal formé dans l'URL répond aussi 404.
- Les erreurs de champ du domaine (fuseau inconnu, pause hors du créneau) ont la même forme qu'une erreur de validation du contrat : 400, avec `errors[]` et un JSON Pointer par champ.
- Les conflits ont un type de problème dédié (`problemTypes`, ADR-0028).

## Heures et durées

- Les heures d'un créneau sont locales au site (`22:00`). Une fin plus tôt que le début signifie le lendemain.
- En base, elles sont stockées en minutes depuis minuit (`SMALLINT`, de 0 à 1439, vérifié par une contrainte CHECK).
- `ShiftTemplate.durationsOn(date, timeZone)` calcule l'amplitude réelle avec Temporal : la nuit 22 h–6 h dure 9 h au passage à l'heure d'hiver, 7 h au passage à l'heure d'été. Le temps effectif est l'amplitude moins la pause.

## Tests

| Niveau      | Où                                        | Avec                                                    |
| ----------- | ----------------------------------------- | ------------------------------------------------------- |
| Domaine     | `domain/**/*.spec.ts`                     | rien : TS pur, nuits de changement d'heure              |
| Use cases   | `application/**/*.spec.ts`                | dépôts en mémoire, `FixedClock`                         |
| HTTP        | `infrastructure/**/http/*.spec.ts`        | module complet, dépôts en mémoire, utilisateurs de test |
| Intégration | `infrastructure/**/*.integration.spec.ts` | vrai PostgreSQL migré (`startTestDatabase`)             |

- Chaque endpoint a son test d'accès croisé (organisation B), qui attend 404.
- Un test vérifie que chaque erreur du domaine et de l'application a sa traduction HTTP : une erreur oubliée deviendrait un 500.
- Les points d'entrée `testing` exposent les doublures : `InMemorySiteRepository`, `createOrganizationTestApp()`, `TestClient`, `testActors`.
