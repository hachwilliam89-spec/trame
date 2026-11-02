# ADR-0015 — LLM via API derrière un port, embeddings locaux

- **Statut** : Accepté (2026-11-01)
- **Contexte** : le VPS a 6 vCPU Haswell, 11 Gio de RAM et pas de GPU, et environ 2 Gio de marge une fois la stack déployée. Un agent à tools fiable demande un modèle bien plus gros que ce que le VPS peut faire tourner. Le critère retenu est la fiabilité, puis la performance, puis l'efficacité.
- **Décision** :
  - L'agent appelle un LLM hébergé, via une API, derrière un port `LlmProvider`. L'adaptateur est interchangeable sans toucher au domaine.
  - Le fournisseur est choisi en v0.4 par la suite d'évals : taux d'appels d'outils corrects, latence p95, coût par requête. À résultats équivalents, on préfère un fournisseur européen (RGPD).
  - Pseudonymisation systématique avant l'envoi : des ID, jamais de noms.
  - Les embeddings du RAG sont calculés localement sur CPU (modèle multilingue léger) et stockés dans pgvector.
  - Plafond de budget mensuel et quota par session. Au-delà, mode dégradé : l'application fonctionne sans l'assistant.
- **Conséquences** :
  - (+) Les appels d'outils sont aussi fiables que le meilleur modèle disponible, sans charger le VPS ni concurrencer le solveur.
  - (+) Le fournisseur se remplace sans toucher au code métier, et aucune donnée nominative ne sort du serveur.
  - (−) Dépendance réseau et coût à l'usage, à suivre dans Grafana (traces OTel GenAI).
- **Alternatives écartées** :
  - petit modèle local via Ollama : lent, appels d'outils peu fiables, et il concurrence le solveur pour le CPU ;
  - embeddings via API : les documents sortent du serveur, avec un coût récurrent pour un calcul faisable en local.
