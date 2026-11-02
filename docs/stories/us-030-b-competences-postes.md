# US-030 — PR B : compétences et postes

Périmètre validé avec Kim le 2026-11-02, dans la continuité de la PR A (#7). Suivi : [issue #10](https://github.com/hachwilliam89-spec/trame/issues/10).

En tant qu'admin, je veux définir les compétences et les postes d'un site afin de décrire les qualifications nécessaires aux futures affectations.

## Périmètre et contrats

- Les compétences appartiennent à l'organisation et sont réutilisables sur ses différents sites.
- Un poste appartient à un site et porte une liste de compétences requises de la même organisation. Une liste vide est autorisée ; les identifiants répétés sont refusés.
- Les noms sont non vides, limités à 100 caractères comme les noms de sites. Leur unicité n'est pas imposée. Le caractère NUL est refusé, car PostgreSQL ne peut pas le stocker.
- Écriture réservée à l'admin ; lecture à l'admin et au manager. L'organisation vient de l'utilisateur authentifié.
- Contrats ajoutés : `skill.v1.ts` et `position.v1.ts` dans `libs/shared/contracts/src/organization/`.
- Sept endpoints : création, liste paginée et consultation des compétences et des postes, plus suppression d'une compétence inutilisée.
- Les habilitations des employés et leurs dates d'expiration appartiennent à US-031 ; l'interface appartient à la PR C.

## Scénarios BDD

```gherkin
Scénario: Catalogue partagé dans une organisation
  Étant donné un admin de l'organisation A
  Quand il crée la compétence "CACES R489"
  Alors le manager de A peut la consulter dans son catalogue
  Et elle n'apparaît pas dans le catalogue de l'organisation B

Scénario: Poste avec plusieurs compétences
  Étant donné le site "Colmar" et les compétences "CACES R489" et "Réception" dans A
  Quand l'admin crée le poste "Cariste" sur Colmar avec ces compétences
  Alors le manager retrouve ce poste et ses deux compétences

Scénario: Poste sans compétence spécifique
  Étant donné un site de A
  Quand l'admin crée le poste "Préparation" avec une liste vide de compétences
  Alors le poste est créé avec cette liste vide

Scénario: Référence de compétence invalide
  Étant donné un site de A
  Quand l'admin crée un poste avec une compétence absente ou appartenant à B
  Alors la création répond "introuvable" dans les deux cas
  Et aucun poste partiel n'est enregistré

Scénario: Compétence utilisée
  Étant donné la compétence "CACES R489" exigée par le poste "Cariste"
  Quand l'admin tente de supprimer cette compétence
  Alors la suppression est refusée avec un conflit explicite
  Et le poste conserve sa compétence requise

Scénario: Compétence inutilisée
  Étant donné une compétence qui n'est exigée par aucun poste
  Quand l'admin la supprime
  Alors elle n'est plus consultable et disparaît du catalogue

Scénario: Accès croisé
  Étant donné des ressources appartenant à A
  Quand un admin de B tente de les consulter, de les supprimer ou de créer un poste sur un site de A
  Alors il reçoit la même réponse "introuvable" que pour une ressource absente
  Et aucune ressource de A n'est modifiée

Scénario: Écritures réservées à l'admin
  Étant donné un manager ou un employé
  Quand il tente de créer une compétence ou un poste, ou de supprimer une compétence
  Alors l'action est refusée
  Et une requête anonyme est refusée sur chaque endpoint

Scénario: Pagination isolée
  Étant donné plusieurs compétences et postes dans deux organisations
  Quand un manager parcourt les pages de son catalogue et de son site
  Alors il retrouve chaque élément autorisé une seule fois
  Et aucun élément d'une autre organisation ou d'un autre site

Scénario: Création et suppression concurrentes
  Étant donné une compétence inutilisée
  Quand sa suppression et la création d'un poste qui l'exige arrivent simultanément
  Alors soit le poste est créé et la suppression est refusée
  Soit la compétence est supprimée et le poste n'est pas créé
  Et il n'existe jamais de poste avec une compétence manquante
```

## Implémentation et vérification

- Domaine et cas d'usage dans les trois couches existantes du module de référence ; aucun nouvel outil.
- Nouvelle migration additive : compétences, postes, association explicite entre postes et compétences. Les relations portent aussi l'organisation ; la suppression d'une compétence utilisée est interdite en base.
- Création du poste et de ses associations dans une seule transaction. Traduction des conflits et références disparues en erreurs métier sans fuite SQL.
- Tests HTTP d'acceptation, tests unitaires du domaine et des cas d'usage, puis tests sur PostgreSQL pour les clés étrangères, l'atomicité et les accès concurrents.
- Vérifications finales : lint, types, tests, build, intégration, contrats, migration sans écart, formatage et Knip.

Références techniques : [transactions Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions) ; [actions référentielles Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/referential-actions).

## Traçabilité des scénarios

Les chemins ci-dessous sont relatifs à `libs/api/organization/`.

| Scénario                             | Tests d'acceptation et de persistance                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalogue partagé                    | `infrastructure/src/lib/http/skills.controller.spec.ts` : « BDD catalogue » et « BDD pagination »                                                                                    |
| Poste avec plusieurs compétences     | `infrastructure/src/lib/http/positions.controller.spec.ts` : « BDD poste avec plusieurs compétences » ; relecture réelle dans `persistence/catalog-repositories.integration.spec.ts` |
| Poste sans compétence spécifique     | `positions.controller.spec.ts` : « BDD poste sans compétence spécifique » ; création réelle dans `persistence/catalog-repositories.integration.spec.ts`                              |
| Référence invalide                   | `positions.controller.spec.ts` : « BDD référence invalide » ; annulation complète dans `persistence/catalog-repositories.integration.spec.ts`                                        |
| Compétence utilisée                  | `skills.controller.spec.ts` : « BDD compétence utilisée » ; refus de suppression en 409 dans `organization.integration.spec.ts`                                                      |
| Compétence inutilisée                | `skills.controller.spec.ts` : « BDD compétence inutilisée » ; suppression réelle dans `organization.integration.spec.ts`                                                             |
| Accès croisé                         | « BDD accès croisé » dans les deux contrôleurs ; clés étrangères composites dans `persistence/catalog-repositories.integration.spec.ts`                                              |
| Écritures réservées à l'admin        | « BDD autorisations » et requêtes anonymes dans les deux contrôleurs                                                                                                                 |
| Pagination isolée                    | « BDD pagination » dans les deux contrôleurs ; pages réelles dans `persistence/catalog-repositories.integration.spec.ts`                                                             |
| Création et suppression concurrentes | « BDD concurrence » dans `persistence/catalog-repositories.integration.spec.ts`, complété par les deux ordres d'exécution déterministes                                              |

### Défauts reproduits puis corrigés pendant l'implémentation

- **Précision des dates** : un test HTTP sur PostgreSQL a montré que `createdAt` changeait entre création et relecture. Les nouveaux contrats exposent maintenant les millisecondes conservées par Prisma ; `catalog-presenters.spec.ts` reproduit l'écart avec un instant comportant des nanosecondes.
- **Nom contenant NUL** : la revue croisée a trouvé une entrée acceptée par la validation mais refusée par PostgreSQL. Le test HTTP réel a reproduit le 500 ; contrats et domaine refusent désormais cette entrée et le test attend 400. Source : [PostgreSQL 18, types caractères](https://www.postgresql.org/docs/18/datatype-character.html).

Les modèles Pydantic concernent les échanges avec le moteur. Leur génération est exécutée, mais les contrats de ce catalogue HTTP n'ajoutent aucun message au moteur (ADR-0018).
