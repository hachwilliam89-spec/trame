# ADR-0007 — RabbitMQ + pattern outbox pour les résolutions

- **Statut** : Accepté
- **Contexte** : les résolutions sont longues et doivent survivre aux redémarrages. L'API et le moteur sont écrits dans deux langages.
- **Décision** : l'API écrit l'événement dans une table outbox, dans la même transaction que la donnée métier. Un relais le publie ensuite sur RabbitMQ. Le moteur publie sa progression et ses résultats, avec retry et dead-letter queue.
- **Conséquences** :
  - (+) Aucun job perdu, découplage complet, progression en temps réel.
  - (−) Un composant de plus, et des messages à rendre idempotents.
- **Alternatives écartées** : BullMQ (client Python moins mature) ; HTTP avec callback (fragile) ; Redis Streams (moins d'outillage pour les DLQ).
