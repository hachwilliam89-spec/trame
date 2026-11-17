# Transport du diagnostic et de la génération (US-009 A2, US-061)

Processus Node distinct de l'API HTTP : il transmet l'outbox puis reçoit les rapports du
worker Python, pour le diagnostic et pour la génération d'un planning, sur une même connexion. Son arrêt laisse les demandes persistées en attente ; aucun traitement
n'est lancé dans le processus HTTP.

```bash
pnpm nx run infra:up
pnpm nx run engine:install
pnpm nx serve api
# Dans deux autres terminaux :
pnpm nx run relay:serve
pnpm nx run engine:worker
```

Ajouter `AMQP_URL` de `.env.example` à un `.env` existant. Nx charge l'environnement de
la racine. Le transport exige `DATABASE_URL` et `AMQP_URL`. Il valide les protocoles au
démarrage ; ses erreurs ne journalisent ni valeur de configuration, ni URL, ni corps.
`LOG_LEVEL` vaut `info` par défaut. Les fichiers communs de topologie sont
`infra/rabbitmq/diagnostic-topology.json` et `infra/rabbitmq/schedule-topology.json` ;
`DIAGNOSTIC_TOPOLOGY_FILE` et `SCHEDULE_TOPOLOGY_FILE` peuvent désigner d'autres fichiers
**par chemin absolu** (les cibles Node et Python ont des cwd différents).

Chaque flux a son relais d'outbox, qui ne prend que ses propres types de message, filtrés dans
la sélection SQL : une demande d'un flux ne bloque jamais l'autre. Un rapport de génération est
borné à 1 Mio, et son planning contrôlé contre l'instantané stocké avant d'être enregistré.
Une demande ou un rapport de génération en rebut, rattaché à sa demande publiée, fait échouer
la génération si elle n'est pas terminée (`RETRIES_EXHAUSTED` ou `PROCESSING_FAILED`).

Si `RELAY_LIVENESS_FILE` est défini, la boucle touche ce fichier au plus toutes les 5 s : c'est
la sonde du conteneur au staging (`/tmp/trame-relay-alive`, sur un tmpfs privé), qui le juge
vivant s'il a moins de 20 s.

Le processus utilise une connexion/une requête SQL bornées à 5 secondes, et des publications
AMQP confirmées en 5 secondes au maximum. Une publication retournée (`mandatory`),
refusée ou incertaine n'est jamais marquée envoyée. La connexion est recréée avec une pause
entre essais ; un doublon reste possible après confirmation suivie d'un crash avant commit.

Les rapports et les lettres mortes arrivent par des abonnements `basic.consume` avec
acquittement manuel et `prefetch=1`. Une panne PostgreSQL laisse la livraison non acquittée,
avec attente et sondage de la base ; elle ne consomme pas les reprises de traitement.
L'arrêt SIGINT/SIGTERM ferme la connexion : les livraisons non acquittées restent rejouables.

La topologie et la distinction entre reprise de traitement et attente d'infrastructure sont
détaillées dans [l'ADR-0032](../../docs/adr/0032-transport-diagnostic-et-reprises.md).
La supervision, les utilisateurs/vhosts et les images de déploiement appartiennent à US-005.
Aucun port supplémentaire n'est publié par ce processus.

US-005 A ajoute `pnpm nx build relay` et l'image `relay` : le processus livré
exécute `node main.js`, sans `tsx`. La [preuve conteneurisée](../../infra/docker/README.md)
teste le relais avec les mêmes contrats et la topologie versionnée, sans publier de port.
