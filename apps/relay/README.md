# Transport du diagnostic (US-009 A2)

Processus Node distinct de l'API HTTP : il transmet l'outbox puis reçoit les rapports du
worker Python. Son arrêt laisse les demandes persistées en attente ; aucun traitement
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
`LOG_LEVEL` vaut `info` par défaut. Le fichier commun de topologie est
`infra/rabbitmq/diagnostic-topology.json` ; `DIAGNOSTIC_TOPOLOGY_FILE` peut désigner un
autre fichier **par chemin absolu** (les cibles Node et Python ont des cwd différents).

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
