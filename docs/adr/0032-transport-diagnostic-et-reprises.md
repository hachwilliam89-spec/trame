# ADR-0032 — Transport du diagnostic et séparation des reprises

- **Statut** : Proposé (2026-11-04)
- **Contexte** : US-009 doit prouver la chaîne Node → RabbitMQ → Python → Node, avec
  confirmations, redélivrances et pannes. Une limite de reprises appliquée aussi à une panne
  de base pourrait parquer le seul résultat avant d'avoir enregistré un état terminal.
- **Décision proposée** :
  - Un processus Node séparé du HTTP transmet l'outbox et reçoit les rapports ; le worker
    Python reste sans base. L'arrêt d'un processus n'efface pas les demandes conservées.
  - Topologie commune versionnée, files quorum durables sous RabbitMQ 4.3.7, publications
    persistantes avec confirmations et `mandatory`, abonnements permanents et ACK manuels.
    Un seul consommateur Python actif et `prefetch=1` imposent un diagnostic à la fois.
  - Les files de demandes et rapports autorisent trois reprises après la livraison initiale,
    avec délai linéaire de 1 s plafonné à 5 s, puis dead lettering au moins une fois.
    `basic.reject` signale l'échec ; en 4.3, `basic.nack` n'incrémente plus ce compteur.
  - La DLQ finalise l'échec : correspondance vérifiée avec la demande conservée, écriture
    atomique via inbox, publication confirmée vers le parking, puis ACK. Un message
    inattribuable est parqué sans modifier de job. Le parking n'a pas de consommateur.
  - L'indisponibilité PostgreSQL attend sans ACK/reject et sans fermer volontairement le
    broker. La DLQ n'a pas de limite automatique ni de DLX vers le parking : une panne
    d'infrastructure ou plusieurs redémarrages ne doivent pas expulser un échec non persisté.
    Cette finalisation attend avec délai ; elle ne relance jamais le calcul. Un défaut durable
    de stockage reste retenu et journalisé, jusqu'à réparation, plutôt que silencieusement perdu.
  - Les publications Node ont une échéance de 5 s et invalident le canal en cas d'incertitude.
    Le worker Pika utilise SIGALRM/setitimer dans son thread principal Linux/macOS : 5 s
    pour la publication et 5 s pour fermer la connexion incertaine. Fermeture encore bloquée :
    sortie 75, sans ACK, pour supervision. Pas de réutilisation d'un canal incertain.
  - L'inbox et le verrou du job garantissent un seul résultat et un seul événement terminal
    visibles, même si le solveur recalcule après une panne. Ce n'est pas une exécution physique
    exactement une fois. Les cinq issues applicatives sont traitées ; MODEL_INVALID devient
    un échec technique. CANCELLED n'est pas un statut natif CP-SAT ni un endpoint ajouté ici.
- **Conséquences** :
  - (+) Pas de marquage envoyé avant confirmation, ni d'ACK avant commit.
  - (+) Les pannes de dépendance ne consomment pas le budget de tentatives métier.
  - (−) Quatre files, une DLQ à surveiller, et un processus de plus à superviser dans US-005.
  - (−) Une file quorum sur notre nœud unique n'apporte pas de haute disponibilité du VPS.
    Les limites de volume et `reject-publish` empêchent l'éviction silencieuse du backlog.
  - (−) Le watchdog Pika cible POSIX ; un support Windows natif demanderait un autre adaptateur.
- **Alternatives** : une boucle `nack/requeue` sans délai ni plafond, ou une DLQ automatiquement
  parquée malgré une base indisponible, ne respectent pas la garantie recherchée. Un framework
  d'orchestration n'est pas nécessaire pour ce diagnostic fixe.
- **Sources** :
  - [RabbitMQ 4.3 — quorum queues](https://www.rabbitmq.com/docs/4.3/quorum-queues) : délais,
    compteur d'échecs, dead lettering au moins une fois et compromis des limites.
  - [amqplib — Channel API](https://amqp-node.github.io/amqplib/channel_api.html).
  - [Pika 1.4.4 — BlockingConnection](https://github.com/pika/pika/blob/1.4.4/pika/adapters/blocking_connection.py) :
    les timeouts de connexion ne bornent pas l'attente d'une confirmation.
  - [Python 3.14 — signal.setitimer](https://docs.python.org/3.14/library/signal.html#signal.setitimer).
