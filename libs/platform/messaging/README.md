# Messagerie AMQP

`AmqpSession` ouvre une connexion et deux canaux : publication confirmée sérialisée,
réception avec `prefetch=1`. Les noms, arguments de files et clés de routage sont injectés ;
la lib ne dépend ni de Prisma ni des contrats métier.

- `declare(exchange, queues)` crée les ressources durables puis leurs bindings.
- `subscribe(queue, handler)` garde un abonnement `basic.consume`, sans ACK automatique.
  Une annulation inattendue ou un handler non récupéré ferme la connexion pour reprise.
- `publish(destination, body)` attend la confirmation et refuse un retour `mandatory`.
  Le timeout ferme le canal incertain ; un ACK de publication ne prouve pas la consommation.
- `get(queue)` sert aux inspections ponctuelles des tests. Il ne convient pas aux files
  quorum avec consommateur unique ; les traitements utilisent `subscribe`.
- `isOpen` signale aussi la perte de l'un des canaux ; `close()` ferme la connexion.

`@trame/platform/messaging/testing` fournit un RabbitMQ réel Testcontainers et la réservation
d'un port TCP. Un port hôte fixe garde l'URL inchangée au redémarrage de ce conteneur de test.

Vérification : `pnpm nx test platform-messaging` ; le contexte consommateur vérifie la lib
sur un vrai broker, y compris les retours, les reprises et le redémarrage.
