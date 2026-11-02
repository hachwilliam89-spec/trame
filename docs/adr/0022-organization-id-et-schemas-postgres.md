# ADR-0022 — Données : `organizationId` dès la v0.1, un schéma Postgres par contexte

- **Statut** : Accepté (2026-11-01)
- **Contexte** : ajouter le multi-tenant après coup oblige à réécrire toutes les requêtes. Une base partagée sans frontières couple les contextes au niveau des tables.
- **Décision** :
  - Chaque agrégat porte un `organizationId`, et chaque requête filtre dessus, ce que vérifient les tests de repository. L'isolation par Row Level Security arrive en v1.0.
  - Un schéma Postgres par bounded context (`multiSchema` de Prisma). Aucune jointure ni clé étrangère entre contextes : les références croisées passent par identifiant.
  - _Amendements_ :
    - **Migrations expand/contract** : une migration ne casse jamais la version précédente de l'API. Supprimer ou renommer une colonne se fait en deux releases. Le retour à l'image précédente reste ainsi sûr, et il est testé sur staging.
    - **Autorisation par objet** : au-delà de l'`organizationId`, chaque accès vérifie la propriété. Chaque endpoint a un test d'accès croisé.
    - **Prisma 7** demande un adaptateur de pilote : `@prisma/adapter-pg`.
- **Conséquences** :
  - (+) Passage au multi-tenant sans réécriture, frontières visibles jusque dans la base, et retour arrière sûr.
  - (−) La cohérence entre contextes passe par les événements, et chaque changement de schéma destructeur prend deux releases.
