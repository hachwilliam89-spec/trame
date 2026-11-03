# Contexte `organization` (module de référence)

Sites, créneaux types, compétences et postes (US-030, PR A et B). L'interface arrive avec la PR C.

C'est le **module de référence** (AGENTS.md) : tout nouveau contexte reproduit cette structure, ces conventions et ces types de tests.

## Les trois couches

| Lib                              | Contenu                                               | Dépend de                                      |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `@trame/api/organization/domain` | agrégats, value objects, erreurs métier. TS pur.      | rien (Temporal et Intl sont natifs)            |
| `…/application`                  | use cases, ports des dépôts, erreurs « introuvable ». | `domain`, `platform` (horloge, ids, pages)     |
| `…/infrastructure`               | dépôts Prisma, contrôleurs REST, module Nest.         | les deux, `api/database`, `platform`, contrats |

- **Domaine** : `Site` (code unique dans l'organisation, fuseau IANA) et `ShiftTemplate` (heures locales, pause obligatoire et positionnée dans le créneau, durées réelles à une date). Le libellé d'un créneau n'est pas unique : son identifiant suffit. Un agrégat se construit par `create()`, qui vérifie ses règles, qu'il soit nouveau ou relu en base. Les erreurs héritent de `DomainError` : leur message s'adresse à l'utilisateur, en français, et l'API le renvoie tel quel.
- **Application** : un use case par classe, sans décorateur, avec une méthode `execute()`. Il reçoit l'`organizationId` en paramètre et ne connaît ni HTTP ni l'utilisateur. Les règles qui demandent de voir les autres agrégats (unicité du code) sont vérifiées ici.
- **Catalogue** : `Skill` appartient à l'organisation et peut servir sur plusieurs sites. `Position` appartient à un site et porte un ensemble de compétences requises, éventuellement vide. Les noms ne sont pas uniques. Les identifiants de compétences sont normalisés en minuscules et triés ; un doublon est refusé.
- **Infrastructure** :
  - le module Nest assemble les use cases avec leurs dépendances (`useFactory`) ;
  - les contrôleurs valident l'entrée avec les contrats zod, prennent l'organisation de l'utilisateur authentifié, jamais de la requête, et traduisent les erreurs par `organizationErrorMappings` ;
  - les dépôts Prisma filtrent chaque lecture et suppression sur l'organisation, et traduisent les conflits d'unicité ou de références en erreurs métier.

## Endpoints

| Méthode et chemin (`/api/v1`)                                        | Rôles          | Réponses                |
| -------------------------------------------------------------------- | -------------- | ----------------------- |
| `POST /sites`                                                        | admin          | 201, 400, 401, 403, 409 |
| `GET /sites?limit=&cursor=`                                          | admin, manager | 200, 400, 401, 403      |
| `GET /sites/{siteId}`                                                | admin, manager | 200, 401, 403, 404      |
| `POST /sites/{siteId}/shift-templates`                               | admin          | 201, 400, 401, 403, 404 |
| `GET /sites/{siteId}/shift-templates?limit=&cursor=`                 | admin, manager | 200, 400, 401, 403, 404 |
| `GET /sites/{siteId}/shift-templates/{id}/durations?date=AAAA-MM-JJ` | admin, manager | 200, 400, 401, 403, 404 |
| `POST /skills`                                                       | admin          | 201, 400, 401, 403      |
| `GET /skills?limit=&cursor=`                                         | admin, manager | 200, 400, 401, 403      |
| `GET /skills/{skillId}`                                              | admin, manager | 200, 401, 403, 404      |
| `DELETE /skills/{skillId}`                                           | admin          | 204, 401, 403, 404, 409 |
| `POST /sites/{siteId}/positions`                                     | admin          | 201, 400, 401, 403, 404 |
| `GET /sites/{siteId}/positions?limit=&cursor=`                       | admin, manager | 200, 400, 401, 403, 404 |
| `GET /sites/{siteId}/positions/{positionId}`                         | admin, manager | 200, 401, 403, 404      |

- Une ressource d'une autre organisation répond 404, exactement comme une ressource absente.
- Un identifiant mal formé dans l'URL répond aussi 404.
- Les erreurs de champ du domaine (fuseau inconnu, pause hors du créneau) ont la même forme qu'une erreur de validation du contrat : 400, avec `errors[]` et un JSON Pointer par champ.
- Les conflits ont un type de problème dédié (`problemTypes`, ADR-0028).

### Compétences et postes

- Création d'une compétence : `{ "name": "CACES R489" }`.
- Création d'un poste : `{ "name": "Cariste", "skillIds": ["<uuid>"] }`. `skillIds` est obligatoire ; `[]` signifie qu'aucune compétence spécifique n'est exigée.
- Les noms contiennent entre 1 et 100 caractères, dont au moins un caractère visible.
- Aucun texte saisi (nom de site, libellé de créneau, nom de compétence ou de poste) n'accepte le caractère NUL, que PostgreSQL ne peut pas stocker : le contrat partagé `requiredText` le refuse en 400, à la frontière.
- Une compétence absente ou étrangère dans `skillIds` donne le même 404. La création ne laisse jamais de poste partiel.
- Supprimer une compétence requise par un poste donne un 409 de type `problemTypes.skillInUse` (`tag:wkhach.dev,2026-11-02:trame:problem:skill-in-use`). Une suppression réussie donne un 204 sans corps ; une deuxième tentative donne 404.
- `createdAt` est à la milliseconde pour toutes les ressources : l'horloge système est tronquée à la précision de `timestamptz(3)`, si bien que la réponse de création et la relecture donnent la même date.

## Heures et durées

- Les heures d'un créneau sont locales au site (`22:00`). Une fin plus tôt que le début signifie le lendemain.
- En base, elles sont stockées en minutes depuis minuit (`SMALLINT`, de 0 à 1439, vérifié par une contrainte CHECK).
- `ShiftTemplate.durationsOn(date, timeZone)` calcule les durées réelles avec Temporal. La nuit 22 h–6 h dure 9 h au passage à l'heure d'hiver, et 7 h au passage à l'heure d'été.
- Une heure locale désigne **le premier instant où l'horloge du site l'affiche** :
  - heure répétée (passage à l'heure d'hiver) : sa première occurrence ;
  - heure sautée (passage à l'heure d'été) : l'instant du saut, car l'horloge passe directement au-delà.

  Cette règle conserve l'ordre : la fin d'un créneau ne précède jamais son début. Le comportement par défaut de Temporal, qui décale une heure sautée d'une heure, donnait −15 min pour 2 h 45–3 h 30 la nuit du passage à l'heure d'été ; la règle donne 30 min.

- La pause dure son nombre de minutes en temps réel, à partir de son heure de début. Seule sa partie comprise dans le créneau est retranchée (`breakMinutes`) : une pause repoussée après la fin par le saut ne retranche rien.
- Un test parcourt tous les créneaux à la demi-heure sur les deux nuits de changement d'heure : amplitude et temps effectif jamais négatifs, pause retranchée jamais plus longue que la pause.

## Données

- Un créneau type porte l'organisation de son site. La clé étrangère composite (`site_id`, `organization_id`) → `sites (id, organization_id)` garantit en base qu'ils sont identiques, même pour une écriture qui ne passerait pas par l'API.
- Un poste porte la même clé étrangère composite vers son site. L'association `position_skills` porte deux clés étrangères composites vers le poste et la compétence, avec `organization_id` dans chacune.
- Le poste et ses associations sont créés dans une seule transaction. Une compétence supprimée entre la vérification applicative et l'écriture fait annuler toute la création.
- `DeleteSkill` vérifie qu'aucun poste n'exige la compétence (`PositionRepository.isSkillRequired`). La clé étrangère `ON DELETE RESTRICT` est le filet d'une création de poste concurrente : la suppression échoue alors aussi en 409. Les habilitations des employés restent dans le contexte `staff` (US-031).
- La migration de la PR B ajoute trois tables et leurs contraintes. Elle ne modifie pas les migrations ni les tables utilisées par l'API précédente.

## Tests

| Niveau      | Où                                        | Avec                                                    |
| ----------- | ----------------------------------------- | ------------------------------------------------------- |
| Domaine     | `domain/**/*.spec.ts`                     | rien : TS pur, nuits de changement d'heure              |
| Use cases   | `application/**/*.spec.ts`                | dépôts en mémoire, `FixedClock`                         |
| HTTP        | `infrastructure/**/http/*.spec.ts`        | module complet, dépôts en mémoire, utilisateurs de test |
| Intégration | `infrastructure/**/*.integration.spec.ts` | vrai PostgreSQL migré (`startTestDatabase`)             |

- Chaque endpoint a un test d'isolation : une ressource étrangère donne 404 et une liste ne contient que les ressources autorisées.
- Un test vérifie que chaque erreur du domaine et de l'application a sa traduction HTTP : une erreur oubliée deviendrait un 500.
- Les points d'entrée `testing` exposent les doublures : dépôts en mémoire, `createOrganizationTestApp()`, `TestClient`, `testActors`.
- Les scénarios BDD vivent dans l'issue de la story (US-030 B : #10), et la PR relie chacun à ses tests. Les tests PostgreSQL vérifient les références croisées, la transaction et la concurrence ; les tests HTTP sur vraie base vérifient aussi l'assemblage des adaptateurs et les réponses 400/404/409.
