# ADR-0014 — Le LLM ne génère jamais le planning

- **Statut** : Accepté
- **Contexte** : les LLM sont mauvais en satisfaction de contraintes, et le planning a des enjeux légaux.
- **Décision** : l'IA propose, le solveur garantit, la PE vérifie.
  - L'agent traduit les demandes en données structurées et explique les résultats.
  - Toute écriture passe par un use case et par la PE, et demande une confirmation humaine.
  - L'agent agit avec les droits de l'utilisateur, jamais plus.
- **Conséquences** :
  - (+) Des garanties formelles, et une IA auditable.
  - (−) L'agent dépend de tools bien conçus.
- **Alternatives écartées** : génération directe par le LLM (non fiable, non conforme).
