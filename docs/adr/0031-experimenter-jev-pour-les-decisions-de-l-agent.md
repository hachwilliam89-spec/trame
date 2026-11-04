# ADR-0031 — Expérimenter Jev pour les décisions de l'agent

- **Statut** : Proposé (2026-11-04)
- **Contexte** : l'assistant v0.4 est prévu avec un LLM hébergé (ADR-0015). Kim souhaite
  tester une autre approche pour apprendre et comparer : Jev, de TypeSafe, renvoie des
  décisions typées plutôt que du texte libre. Une boucle contrôlée par l'application
  pourrait s'en servir pour choisir ses prochaines actions sans LLM génératif.
- **Décision proposée** :
  - Mener l'[expérimentation Jev](../experiments/jev.md), avec données fictives, outils
    autorisés, scénarios BDD à valider et évaluations comparatives.
  - Tester Jev comme pilote de l'agent, pas seulement comme routeur préalable à un LLM :
    observer → choisir une action → appeler un outil → examiner le résultat → poursuivre
    ou s'arrêter. Des modèles de phrases peuvent expliquer les faits des outils.
  - Le modèle ne devient ni le solveur ni la PE. Il propose via les use cases, avec les
    droits de l'utilisateur et confirmation humaine avant écriture (ADR-0014).
  - Distinguer le port de décision de l'éventuel port de génération de texte. Le contrat
    exact et le SDK seront choisis avec le prototype, sans nouvelle abstraction générique
    tant qu'elle ne sert pas un besoin implémenté (ADR-0026).
  - Comparer Jev à une procédure déterministe et à un LLM avec les mêmes cas et outils :
    qualité de bout en bout, abstentions, sécurité, latence et coût total. Fixer les seuils
    et le budget avant la campagne.
  - Le raccordement à l'assistant livré reste conditionné aux résultats et à une décision
    ultérieure validée par Kim. Cette expérimentation ne remplace pas l'ADR-0015 et ne
    modifie pas le chemin critique de la v0.1.
- **Conséquences** :
  - (+) Le projet teste une alternative réelle à la génération de texte pour piloter un
    agent, avec une conclusion mesurable et réutilisable.
  - (+) L'assistant reste facultatif ; les droits et les règles métier restent contrôlés
    par l'application et le moteur.
  - (−) Des réponses bien typées peuvent rester erronées. Il faut des évaluations locales,
    des arrêts bornés et une validation serveur indépendante du modèle.
  - (−) Le fournisseur ajoute une dépendance réseau et un coût. Le premier banc utilise
    des doublures ; il faudra rejouer sur les vrais composants avant toute écriture réelle.
- **Alternatives** :
  - LLM seul : référence de comparaison, choix actuel de l'ADR-0015.
  - Procédure déterministe : référence simple, et choix possible si elle suffit.
  - Jev uniquement en préfiltre : usage possible, mais insuffisant pour répondre à la
    question de l'expérience sur le pilotage d'un agent.
- **Sources** :
  - [TypeSafe — Introduction](https://docs.typesafe.ai/introduction).
  - [TypeSafe — Confidence](https://docs.typesafe.ai/confidence).
  - [TypeSafe — Quick start](https://docs.typesafe.ai/introduction/quickstart).
