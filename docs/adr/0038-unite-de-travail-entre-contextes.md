# ADR-0038 — Unité de travail entre contextes : une transaction, assemblée explicitement

- **Statut** : Proposé (2026-11-17). Préparé pour le jeu de démonstration du jalon 1 (US-061, PR 7a).
- **Contexte** :
  - Le jeu de démonstration écrit dans trois contextes par leurs use cases publics : un site, ses compétences, ses postes et ses créneaux (`organization`), douze employés et leurs contrats (`staff`), puis les besoins de la semaine (`demand`). Un chargement interrompu ne doit laisser aucune donnée partielle.
  - Chaque dépôt utilisait le client partagé `PrismaService`. Quatre d'entre eux ouvraient leur propre transaction : employés et postes avec `$transaction([...])`, contrats et besoins avec une transaction interactive. Le test d'intégration de cette PR le montre : une erreur survenue après la dernière écriture laissait une ligne dans chacune des dix tables touchées.
  - Les use cases relisent ce que les précédents viennent d'écrire : un poste vérifie ses compétences, un employé son site, un contrat son employé, un besoin son créneau et son poste. Dans une transaction non validée, ces lectures doivent passer par le même client que les écritures, sinon elles ne voient rien.
  - Les trois contextes partagent la même base PostgreSQL, un schéma chacun, sans clé étrangère entre eux (ADR-0022).
- **Décision** :
  - Les dépôts d'`organization`, `staff` et `demand` reçoivent une `Database` au lieu de `PrismaService`. `database.client` sert à toutes leurs requêtes. `database.transaction(work)` groupe des écritures : hors unité de travail, elle ouvre sa propre transaction, comme avant ; dans une unité de travail, elle rejoint la transaction de l'unité.
  - `runAtomically(prisma, { timeoutMs }, work)` ouvre une transaction interactive et passe à `work` la `Database` de cette transaction. Elle est validée si `work` aboutit et annulée s'il lève une erreur. La durée maximale est choisie par l'appelant, car celle de Prisma par défaut, 5 s, ne convient pas à toutes les opérations.
  - L'opération atomique assemble elle-même, dans `work`, les dépôts, les use cases et les adaptateurs entre contextes sur cette `Database`. Les dépôts sont exportés par leurs libs d'infrastructure à cette fin.
  - L'application Nest n'est pas modifiée : `DatabaseModule` fournit `PrismaDatabase`, la `Database` du client partagé.
- **Comparaison avant décision** :

  | Critère                                    | Assemblage explicite (retenu)                                           | Transaction ambiante (`AsyncLocalStorage`)                                         |
  | ------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
  | Ce qu'un dépôt utilise                     | la `Database` reçue à sa construction                                   | un contexte lu à chaque requête                                                    |
  | Requête hors de la transaction             | impossible : le dépôt n'a pas d'autre client                            | silencieuse, si une dépendance garde `PrismaService` ou démarre un travail détaché |
  | Lecture du code                            | la transaction se voit dans l'assemblage                                | elle dépend de l'appel en cours                                                    |
  | Assemblage                                 | un assemblage par opération atomique, construit pour chaque transaction | les singletons de Nest, réutilisés tels quels                                      |
  | Code des dépôts                            | identique : `database.client`, `database.transaction`                   | identique                                                                          |
  | Rendre atomique un use case appelé en HTTP | demande un assemblage dédié                                             | envelopper son appel suffit                                                        |

  Le chargement de démonstration sera lancé par une commande d'opérateur, assemblée sans Nest (PR 7b) : son assemblage existe dans les deux options. L'assemblage explicite n'ajoute donc aucun code et évite un état implicite.

- **Conséquences** :
  - (+) Un chargement est tout ou rien, même si le processus s'arrête en cours : PostgreSQL annule la transaction non validée.
  - (+) Les lectures d'une opération atomique voient ses propres écritures, et le reste de l'application ne les voit qu'après validation.
  - (+) Hors unité de travail, le comportement des dépôts est inchangé ; leurs tests d'intégration existants le vérifient.
  - (−) Une unité de travail tient une connexion pendant toute sa durée. Les opérations concurrentes sur les mêmes données restent à ordonner par l'appelant (verrou consultatif du chargement, PR 7b) ; l'isolation est celle par défaut, `READ COMMITTED`.
  - (−) Un dépôt qui doit grouper plusieurs écritures passe par `database.transaction`, jamais par `client.$transaction`, qui n'existe pas dans une transaction interactive.
  - (−) L'unité de travail suppose que les contextes concernés partagent une base. Si l'un d'eux prend la sienne, ses écritures sortent de l'unité et l'opération devra passer par des événements et une compensation.
  - Les dépôts de `scheduling` gardent `PrismaService` : aucune opération atomique ne les inclut aujourd'hui.
- **Alternatives écartées** :
  - annuler à la main ce qui a été écrit (compensation) : une panne pendant le chargement laisserait des données partielles, et chaque contexte devrait offrir une suppression qui n'a pas d'autre usage ;
  - la transaction ambiante par `AsyncLocalStorage` : voir la comparaison. À reconsidérer, par une nouvelle ADR, si un use case appelé en HTTP doit écrire de façon atomique dans plusieurs contextes ;
  - un contexte `demo` doté de ses propres dépôts : il écrirait dans les schémas des autres contextes, contre ADR-0022.
- **Références** :
  - ADR-0008 (Prisma), ADR-0022 (un schéma par contexte) ;
  - [Référence du client Prisma 7, options des transactions](https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference).
