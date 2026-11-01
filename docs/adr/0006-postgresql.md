# ADR-0006 — PostgreSQL, pas de base NoSQL

- **Statut** : Accepté
- **Contexte** : les données sont très relationnelles (contrats, compétences, affectations) et leur intégrité est critique (conformité légale).
- **Décision** : PostgreSQL comme source de vérité :
  - JSONB pour les snapshots de résolution ;
  - TimescaleDB pour les séries de charge (v0.3) ;
  - pgvector pour le RAG (v0.4).
- **Conséquences** :
  - (+) Transactions, contraintes d'intégrité, une seule base à opérer et sauvegarder.
  - (−) Les extensions doivent être disponibles dans l'image utilisée.
- **Alternatives écartées** : MongoDB (aucun besoin qui le justifie, intégrité plus faible) ; une base vectorielle dédiée (inutile à ce volume).
