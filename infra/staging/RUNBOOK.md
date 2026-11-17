# Runbook du staging (US-005 B2b)

Mise en service du staging sur le VPS, pas à pas : chaque commande, ce qu'elle doit afficher, et son retour arrière. Le fonctionnement de `deploy.sh` est décrit dans [README.md](README.md) ; ce document dit dans quel ordre agir. Les gestes courants une fois le staging en service (console de Keycloak, comptes, état des services) sont dans [ADMINISTRATION.md](ADMINISTRATION.md).

**Règles**

- Kim approuve et lance chaque commande. Aucun agent n'agit sur le VPS. Seule exception : le déploiement et le retour arrière par GitHub, approuvés par Kim à chaque fois (« Livraison continue », ADR-0035).
- Une sortie différente de l'attendu arrête le déroulé : on diagnostique avant de continuer.
- Sauf mention « sur le poste », les commandes se lancent sur le VPS, en root (`sudo -i`), dans une session `tmux` (`tmux new -s trame`) : une coupure SSH n'interrompt rien, et les variables de l'étape 4 y restent disponibles jusqu'à l'étape 7. `echo "tmux : ${TMUX:-ABSENT}"` dit si l'on y est, `tmux attach -t trame` y revient.
- Les blocs se collent un par un, sur une ligne vide (Ctrl+C la vide), et chaque sortie attendue se vérifie avant le bloc suivant. Un collage long a été tronqué pendant la mise en service : les blocs longs sont découpés.
- Un texte entre chevrons (`<vps>`, `<commit>`, `<fichier>`) est à remplacer avant de lancer la commande : collé tel quel, il provoque une erreur de syntaxe.
- `SHA` est le commit de `main` à mettre en service, en 40 caractères : `export SHA=<commit>` une fois entré dans `tmux`, sur le poste comme sur le VPS, puis `echo "$SHA"`.

**Ce que la répétition a déjà prouvé.** Les étapes 3 à 7 et 9 utilisent les scripts que la répétition du staging joue à chaque passage (`rehearsal.yml`) : installation d'`oras` et de `cosign`, provisionnement, realm `master`, `deploy.sh`. Les étapes marquées **(non répété)** n'ont jamais été jouées : elles demandent plus d'attention. La répétition s'appuie sur une autorité de certification de test : l'émission des certificats par Let's Encrypt ne se vérifie que sur le VPS (étapes 1 et 7).

## 1. Préalables, sans effet sur le VPS

| Contrôle                                | Commande                                                         | Attendu                                                                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Durcissement de l'hôte (US-013)         | `/opt/edge/host/check.sh; echo "code : $?"`                      | Chaque ligne en `[OK]`, puis `code : 0`                                                                                                                                                    |
| KCD et Équilibre répondent              | `/opt/edge/scripts/check.sh; echo "code : $?"`                   | `code : 0`. Garder la sortie : la référence de l'étape 10                                                                                                                                  |
| KCD et Équilibre actifs                 | `docker ps --format '{{.Names}}\t{{.Status}}'`                   | Leurs conteneurs en `Up` : sans eux, la référence mémoire ne vaut rien                                                                                                                     |
| Outils présents                         | `command -v docker git tar curl python3 openssl tmux`            | Sept chemins. `tmux` absent : l'installer, ou accepter le risque d'une coupure SSH                                                                                                         |
| Réseau de Traefik                       | `docker network inspect edge --format '{{.Name}}'`               | `edge`                                                                                                                                                                                     |
| Seul Traefik publie des ports           | `docker ps --format '{{.Names}}\t{{.Ports}}' \| grep -F -e '->'` | Une seule ligne, celle de Traefik                                                                                                                                                          |
| Certificats demandés par l'entrée HTTPS | `grep -n certResolver /opt/edge/traefik.yml`                     | Une ligne `certResolver: letsencrypt` : les routes de Trame ne nomment aucun résolveur                                                                                                     |
| Tunnel SSH permis                       | `sshd -T \| grep -i allowtcpforwarding`                          | `yes` ou `local`. Sinon, la console d'administration est injoignable : décider avant de continuer                                                                                          |
| Mémoire avant                           | `free -m`                                                        | Noter `available` et le swap utilisé : la référence de l'étape 10. Il faut au moins 3,7 Gio disponibles : les 2,5 Gio du critère, plus 1,2 Gio, la somme des maxima observés en répétition |

**Ports ouverts, sur le poste.** `VPS_ADDRESS` est l'adresse IPv4 du VPS ; `-G` est l'option de macOS, `-w` celle de Linux.

```bash
for port in 22 80 443 5432 5672 8080 15672; do nc -z -G 3 "$VPS_ADDRESS" $port >/dev/null 2>&1 && echo "$port ouvert" || echo "$port fermé"; done
```

Attendu : 22, 80 et 443 ouverts, les quatre autres fermés. Le contrôle externe complet d'US-013 (`host/check-externe.sh` du dépôt `vps-edge`) n'a pas été rejoué à la mise en service.

**Répétition finale, sur le poste.** Elle joue la version exacte à mettre en service, avec le script qui la déploiera :

```bash
gh workflow run rehearsal.yml -f version="$SHA"
gh run watch
```

Attendu : le job réussit. Son résumé donne le SHA du script répété, les deux versions et leurs digests. Si une migration sépare `SHA` de la version précédente, la répétition prouve aussi le retour sur le schéma migré. Sans répétition verte sur ce `SHA`, on ne déploie pas.

## 2. DNS

La zone `wkhach.dev` est chez Porkbun (`dig +short NS wkhach.dev`). Y créer deux enregistrements `A` vers l'adresse IPv4 du VPS, pour les hôtes `staging.trame` et `auth.trame`. Pas d'enregistrement `AAAA` : les domaines déjà servis par ce VPS n'en ont pas.

```bash
dig +short staging.trame.wkhach.dev auth.trame.wkhach.dev @salvador.ns.porkbun.com
```

Attendu : l'adresse du VPS, deux fois. La question est posée au serveur de la zone : un résolveur garde en mémoire l'absence de réponse d'un essai fait trop tôt. Les enregistrements doivent répondre **avant** l'étape 7 : Traefik demande les certificats dès que les routes apparaissent, et Let's Encrypt limite les essais en échec.

Retour arrière : supprimer les deux enregistrements.

## 3. Dépôt et outils de vérification

```bash
install -d -m 0755 /opt/trame
git clone https://github.com/hachwilliam89-spec/trame.git /opt/trame/source
git -C /opt/trame/source checkout --detach "$SHA"
git -C /opt/trame/source rev-parse HEAD
```

Attendu : `SHA`. Le clone est en HTTPS, sans identifiant : il ne peut que lire le dépôt public. Il est placé sur le commit dont la répétition a joué le script, le « Script répété » de son résumé : c'est `SHA` lui-même quand la répétition est lancée sur la tête de `main`.

```bash
/opt/trame/source/infra/staging/install-release-tools.sh
```

Attendu : `Installés dans /usr/local/bin : cosign v3.1.4, oras 1.3.6.` Une somme de contrôle différente arrête tout, sans rien installer.

Retour arrière : `rm /usr/local/bin/oras /usr/local/bin/cosign`, puis `rm -rf /opt/trame/source`.

## 4. Secrets

Les mots de passe sont générés en hexadécimal : plusieurs entrent dans une URL, où les caractères `/`, `+` et `=` du base64 seraient mal lus. Les variables sont exportées pour le provisionnement de l'étape 6, qui les lit dans l'environnement. Deux blocs, dans la même session.

```bash
umask 077
install -d -m 0700 /opt/trame/shared/secrets /opt/trame/staging/secrets
secret() { openssl rand -hex 32; }

export TRAME_KEYCLOAK_DATABASE_PASSWORD="$(secret)"
export TRAME_MIGRATOR_PASSWORD="$(secret)" TRAME_API_PASSWORD="$(secret)"
export TRAME_RELAY_PASSWORD="$(secret)" TRAME_WORKER_PASSWORD="$(secret)"

cd /opt/trame/shared/secrets
printf 'POSTGRES_PASSWORD=%s\n' "$(secret)" > postgres.env
printf 'RABBITMQ_DEFAULT_USER=trame-admin\nRABBITMQ_DEFAULT_PASS=%s\n' "$(secret)" > rabbitmq.env
printf 'KC_DB_PASSWORD=%s\nKC_BOOTSTRAP_ADMIN_USERNAME=admin-temporaire\nKC_BOOTSTRAP_ADMIN_PASSWORD=%s\n' \
  "$TRAME_KEYCLOAK_DATABASE_PASSWORD" "$(secret)" > keycloak.env
```

```bash
cd /opt/trame/staging/secrets
database='postgres:5432/trame_staging'
printf 'DATABASE_URL=postgresql://trame_staging_migrator:%s@%s\n' "$TRAME_MIGRATOR_PASSWORD" "$database" > migrator.env
printf 'DATABASE_URL=postgresql://trame_staging_api:%s@%s\n' "$TRAME_API_PASSWORD" "$database" > api.env
printf 'DATABASE_URL=postgresql://trame_staging_api:%s@%s\nAMQP_URL=amqp://trame_staging_relay:%s@rabbitmq:5672/trame-staging\n' \
  "$TRAME_API_PASSWORD" "$database" "$TRAME_RELAY_PASSWORD" > relay.env
printf 'AMQP_URL=amqp://trame_staging_worker:%s@rabbitmq:5672/trame-staging\n' "$TRAME_WORKER_PASSWORD" > worker.env

umask 022
ls -l /opt/trame/shared/secrets /opt/trame/staging/secrets
grep -c -E '[0-9a-f]{64}' /opt/trame/*/secrets/*.env
```

Attendu : sept fichiers en `-rw-------`, propriétaire root, puis le compte des secrets présents : `2` pour `keycloak.env` et `relay.env`, `1` pour les cinq autres. Aucune valeur ne s'affiche. Les noms et les variables sont ceux des modèles de `infra/compose/secrets.example`. `umask 022` rend à la suite les droits par défaut, ceux de la répétition.

Retour arrière, avant tout démarrage : `rm -rf /opt/trame/shared/secrets /opt/trame/staging/secrets`.

## 5. Stack partagée : PostgreSQL et RabbitMQ

Ces deux variables sont nécessaires à toute commande qui lit `shared.yml` :

```bash
cd /opt/trame/source
export TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080
docker compose -f infra/compose/shared.yml build keycloak
docker compose -f infra/compose/shared.yml up -d --wait postgres rabbitmq
docker compose -p trame-shared ps
```

Attendu : `postgres` et `rabbitmq` avec un statut `Up … (healthy)`, sans flèche `->` dans la colonne des ports.

Retour arrière : `docker compose -p trame-shared down` arrête et retire les conteneurs, en gardant les volumes. `down --volumes` détruit les données : seulement avant toute donnée réelle.

## 6. Provisionnement

Dans la même session que l'étape 4. Les scripts sont silencieux quand ils réussissent, et rejouables. Chaque bloc s'arrête au premier échec, et refuse de partir si une variable de l'étape 4 manque.

```bash
(
  set -euo pipefail
  cd /opt/trame/source
  export TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080
  : "${TRAME_KEYCLOAK_DATABASE_PASSWORD:?absente}" "${TRAME_MIGRATOR_PASSWORD:?absente}" "${TRAME_API_PASSWORD:?absente}"
  shared() { docker compose -f infra/compose/shared.yml exec -T "$@"; }

  shared postgres psql --no-psqlrc -U postgres -d postgres < infra/provisioning/postgres-cluster.sql
  shared -e TRAME_KEYCLOAK_DATABASE_PASSWORD postgres psql --no-psqlrc -U postgres -d postgres \
    < infra/provisioning/postgres-keycloak.sql
  shared -e TRAME_ENVIRONMENT=staging -e TRAME_MIGRATOR_PASSWORD -e TRAME_API_PASSWORD postgres \
    psql --no-psqlrc -U postgres -d postgres < infra/provisioning/postgres-environment.sql
  echo "PostgreSQL provisionné"
)
```

```bash
(
  set -euo pipefail
  cd /opt/trame/source
  export TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080
  : "${TRAME_RELAY_PASSWORD:?absente}" "${TRAME_WORKER_PASSWORD:?absente}"
  docker compose -f infra/compose/shared.yml exec -T \
    -e TRAME_ENVIRONMENT=staging -e TRAME_RELAY_PASSWORD -e TRAME_WORKER_PASSWORD rabbitmq \
    sh -s < infra/provisioning/rabbitmq-environment.sh
  echo "RabbitMQ provisionné"
)
```

Attendu : `PostgreSQL provisionné`, puis `RabbitMQ provisionné`, sans autre sortie des scripts. Contrôle :

```bash
cd /opt/trame/source
shared() { docker compose -f infra/compose/shared.yml exec -T "$@"; }
shared postgres psql -U postgres -Atc '\l' | cut -d'|' -f1 | grep -E '^(keycloak|trame_staging)$'
shared rabbitmq rabbitmqctl -q list_vhosts | grep -x trame-staging
```

Attendu : `keycloak`, `trame_staging`, puis `trame-staging`.

Retour arrière : rien à défaire tant que rien ne s'y connecte. Pour repartir de zéro, `down --volumes` de l'étape 5.

## 7. Keycloak et realm `master`

Le DNS d'abord : sans lui, Let's Encrypt refuse le certificat et compte un essai en échec.

```bash
dig +short auth.trame.wkhach.dev staging.trame.wkhach.dev
```

Attendu : l'adresse du VPS, deux fois. Sinon, ne pas démarrer Keycloak.

```bash
(
  set -euo pipefail
  cd /opt/trame/source
  export TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080
  docker compose -f infra/compose/shared.yml up -d --wait --wait-timeout 300 keycloak
  docker compose -f infra/compose/shared.yml exec -T keycloak bash -s < infra/provisioning/keycloak-master-realm.sh
  docker compose -f infra/compose/shared.yml ps
  echo "Keycloak prêt et console configurée"
)
```

Attendu : `keycloak` avec un statut `Up … (healthy)`, puis `Keycloak prêt et console configurée`. Le script donne au realm `master` l'adresse du tunnel (ADR-0034). Il utilise le compte temporaire : il passe **avant** l'étape 8.

Contrôles :

```bash
keycloak_address="$(docker inspect -f '{{(index .NetworkSettings.Networks "edge").IPAddress}}' trame-shared-keycloak-1)"
curl -s "http://$keycloak_address:8080/realms/master/.well-known/openid-configuration" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["issuer"])'
```

```bash
curl -s -o /dev/null -w "%{http_code} trame-staging\n" https://auth.trame.wkhach.dev/realms/trame-staging/.well-known/openid-configuration
curl -s -o /dev/null -w "%{http_code} master\n" https://auth.trame.wkhach.dev/realms/master/.well-known/openid-configuration
curl -s -o /dev/null -w "%{http_code} console\n" https://auth.trame.wkhach.dev/admin/master/console/
```

Attendu : `http://127.0.0.1:18080/realms/master`, puis `200 trame-staging`, `404 master` et `404 console`. Un code `000` : le certificat n'est pas encore émis. Vérifier le DNS, attendre une minute, relancer les trois lignes.

Retour arrière : `docker compose -f infra/compose/shared.yml rm --stop --force keycloak`. Sa base reste dans PostgreSQL.

Les variables de l'étape 4 ne servent plus : `unset TRAME_KEYCLOAK_DATABASE_PASSWORD TRAME_MIGRATOR_PASSWORD TRAME_API_PASSWORD TRAME_RELAY_PASSWORD TRAME_WORKER_PASSWORD`.

## 8. Administrateur permanent **(non répété)**

Joué une fois, à la mise en service ; toujours absent de la répétition.

Sur le poste, ouvrir le tunnel avec l'adresse relevée à l'étape 7, qui change à chaque recréation du conteneur :

```bash
ssh -N -L 18080:<adresse de Keycloak>:8080 <vps>
```

Puis, dans un navigateur, `http://127.0.0.1:18080/admin/master/console/`. Le mot de passe du compte `admin-temporaire` se lit sur le VPS : `grep KC_BOOTSTRAP_ADMIN_PASSWORD /opt/trame/shared/secrets/keycloak.env`.

1. Realm `master`, Users, Add user : un nom d'utilisateur personnel. Dans « Required user actions », choisir « Configure OTP ».
2. Onglet Credentials : poser un mot de passe, non temporaire, gardé dans un gestionnaire de mots de passe.
3. Onglet Role mapping : attribuer le rôle de realm `admin`.
4. Se déconnecter, puis se reconnecter avec ce compte : Keycloak impose l'enrôlement du TOTP.
5. **Seulement après cette connexion réussie**, supprimer le compte `admin-temporaire` (Users).
6. Sur le VPS, retirer ses identifiants du fichier de secrets, puis recréer Keycloak, pour que le conteneur ne les porte plus dans son environnement :

   ```bash
   sed -i '/^KC_BOOTSTRAP_ADMIN_/d' /opt/trame/shared/secrets/keycloak.env
   cd /opt/trame/source
   export TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080
   docker compose -f infra/compose/shared.yml up -d --wait --wait-timeout 300 keycloak
   ```

   Attendu : `keycloak` recréé, puis `Healthy`. Son adresse a pu changer : la relever de nouveau avant de rouvrir le tunnel.

Contrôle : une nouvelle connexion à la console demande le mot de passe et le code TOTP, et la liste des utilisateurs de `master` ne contient plus `admin-temporaire`.

Retour arrière : avant le point 5, supprimer le nouveau compte et recommencer. Après le point 5, la perte du mot de passe ou du TOTP demande la procédure de récupération de Keycloak ([bootstrap-admin](https://www.keycloak.org/server/bootstrap-admin-recovery)), jamais jouée ici.

## 9. Premier déploiement

```bash
/opt/trame/source/infra/staging/deploy.sh "$SHA"
echo "code de sortie : $?"
```

Attendu : les étapes défilent (vérification, extraction, préchargement, sauvegarde, migration, bascule, contrôle de l'adresse publique), puis `Version <SHA> en service sur le staging.` et `code de sortie : 0`.

| Code | Sens                                             | Suite                                                                                                                   |
| ---- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1    | Version refusée, ou premier déploiement en échec | Refusée : rien n'a été touché. En échec : seuls les services du staging sont arrêtés. Lire le motif, corriger, relancer |
| 3    | Impossible pour l'instant                        | Rien n'a été touché : outil, dossier ou verrou                                                                          |
| 4    | Arrêt des services en échec                      | État incertain : `docker compose -p trame-staging ps --all`, puis décider                                               |

Un premier déploiement en échec au contrôle de l'adresse publique : vérifier le DNS et le certificat (contrôles de l'étape 7), puis relancer la même commande. C'est ce qui s'est produit à la mise en service : le certificat n'était pas encore émis au premier lancement, et le second a réussi une fois le DNS et le certificat en place.

Retour arrière : voir « Retirer le staging ».

## 10. Critères de réussite de B2b

Tous doivent être remplis. Sinon, on retire le staging.

1. **Surface.** `docker ps --format '{{.Names}}\t{{.Ports}}' | grep -F -e '->'` ne montre que Traefik. `/opt/edge/host/check.sh` et `/opt/edge/scripts/check.sh` réussissent toujours, et la boucle des ports de l'étape 1, sur le poste, donne le même résultat.
2. **Compte de Kim (non répété dans la console).** Par le tunnel, realm `trame-staging`, Users, Add user : nom, adresse, attribut `organization_id` (un UUID, par exemple `python3 -c 'import uuid; print(uuid.uuid4())'`, à garder pour les données à venir). Credentials : mot de passe **temporaire**. Role mapping : `manager`. La répétition crée ce même compte par l'API d'administration.
3. **Connexion réelle.** Sur `https://staging.trame.wkhach.dev`, « Se connecter » : Keycloak impose l'enrôlement du TOTP et le changement du mot de passe, puis la page du diagnostic s'affiche.
4. **Diagnostic.** « Tester le moteur » affiche « Les trois tâches ont été affectées. » : l'API, le relais, RabbitMQ, le worker et le moteur fonctionnent ensemble.
5. **Mémoire**, au repos, KCD et Équilibre actifs : `free -m` donne au moins 2,5 Gio dans `available`, et le swap utilisé n'a pas grossi depuis l'étape 1. Sinon, retour arrière (critère de #47).
6. **Aucun conteneur tué ni relancé** :

```bash
for project in trame-shared trame-staging; do
  docker ps -aq --filter "label=com.docker.compose.project=$project" \
    | xargs docker inspect -f '{{.Name}} tué={{.State.OOMKilled}} relances={{.RestartCount}}'
done
```

Attendu : `tué=false relances=0` sur chaque ligne.

## Procédures courantes

### Déployer une nouvelle version

Par GitHub, une fois la livraison continue en place (section suivante) :

```bash
gh workflow run deploy-staging.yml -f version=$(git rev-parse origin/main)
```

Le workflow vérifie que le commit est sur `main`, joue la répétition sur cette version, puis attend l'approbation : sur la page du run, « Review deployments », cocher `staging`, « Approve and deploy ». Il se termine par le contrôle de l'adresse publique. Pour revenir à la version précédente : `gh workflow run rollback-staging.yml`, avec la même approbation.

Si la version change les droits RabbitMQ (`infra/provisioning/rabbitmq-environment.sh`), rejouer d'abord le provisionnement RabbitMQ (procédure suivante) : sinon le worker n'atteint pas ses files, reste malsain, et le déploiement revient en arrière.

À la main, si GitHub est indisponible :

1. Sur le poste : répétition verte sur le nouveau `SHA` (étape 1), obligatoire si la version ajoute une migration ou touche `infra/`.
2. `git -C /opt/trame/source fetch origin main && git -C /opt/trame/source checkout --detach "$SHA"`
3. `/opt/trame/source/infra/staging/deploy.sh "$SHA"`

En cas d'échec, le script revient seul à la version en service et le dit. Code 4 : la version restaurée ne répond pas, intervention requise (README, « Codes de sortie »).

### Rejouer le provisionnement RabbitMQ avant un déploiement

Sur le VPS, en root. Le script vient de `origin/main`, la version à déployer, sans changer le clone en service. Les mots de passe sont relus dans les fichiers de secrets, sans s'afficher ni changer. Le bloc PostgreSQL de l'étape 6 n'est pas concerné.

```bash
(
  set -euo pipefail
  cd /opt/trame/source
  git fetch --quiet origin main
  export TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080
  amqp_password() { sed -n 's|^AMQP_URL=amqp://[^:]*:\([0-9a-f]\{64\}\)@.*|\1|p' "/opt/trame/staging/secrets/$1.env"; }
  TRAME_RELAY_PASSWORD="$(amqp_password relay)" TRAME_WORKER_PASSWORD="$(amqp_password worker)"
  : "${TRAME_RELAY_PASSWORD:?absente}" "${TRAME_WORKER_PASSWORD:?absente}"
  export TRAME_RELAY_PASSWORD TRAME_WORKER_PASSWORD
  git show origin/main:infra/provisioning/rabbitmq-environment.sh |
    docker compose -f infra/compose/shared.yml exec -T \
      -e TRAME_ENVIRONMENT=staging -e TRAME_RELAY_PASSWORD -e TRAME_WORKER_PASSWORD rabbitmq sh -s
  echo "RabbitMQ provisionné"
)
```

Contrôle :

```bash
cd /opt/trame/source
TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080 \
  docker compose -f infra/compose/shared.yml exec -T rabbitmq rabbitmqctl -q list_permissions -p trame-staging
```

Attendu : `RabbitMQ provisionné`, puis `trame_staging_relay` et `trame_staging_worker`, chacun avec `^trame\.(diagnostic|schedule)\.` trois fois.

Retour arrière : inutile. Les droits sont seulement élargis, et la version en service n'utilise que les ressources du diagnostic, toujours permises.

### Charger le jeu de démonstration

Remplit l'organisation du compte de Kim avec un entrepôt fictif : un site, trois postes, deux créneaux, douze salariés et les besoins de la semaine qui suit le chargement (lundi suivant, à Paris). La semaine calculée donne un seul manque, le samedi matin : trois caristes demandés, deux encore habilités. Le chargement est tout ou rien (ADR-0038), et refusé si l'organisation a déjà un site.

Les deux temps partiels du jeu (14 h à 21 h) sont sous le minimum supplétif de 24 h (C. trav., art. L3123-27) : dérogation fictive, demandée par écrit et motivée par chaque salarié (art. L3123-7).

1. Relire l'organisation : par le tunnel, realm `trame-staging`, Users, compte de Kim, onglet Attributes, valeur de `organization_id` (étape 2 des critères de réussite).
2. Sur le VPS, coller cette valeur à l'invite, puis charger :

```bash
read -r -p 'organization_id : ' ORGANIZATION_ID
docker exec trame-staging-api-1 node load-demo.js --organization "$ORGANIZATION_ID"
```

La commande affiche `{"siteId":"…","weekStartsOn":"AAAA-MM-JJ"}`. L'écran Planning (PR 8) ouvrira cette semaine à l'adresse `https://staging.trame.wkhach.dev/planning?site=<siteId>&semaine=<weekStartsOn>`. Code 1 et message `… a déjà un site …` : rien n'a été écrit.

Retour arrière : retire, dans une seule transaction, ce qui est rattaché au site de démonstration (générations comprises) et les compétences du jeu que plus rien n'utilise. Le reste de l'organisation n'est pas touché. Si le site donné n'est pas le site `DEMO` de cette organisation, le script s'arrête sans rien supprimer. Coller à l'invite le `siteId` affiché par le chargement :

```bash
read -r -p 'siteId : ' SITE_ID
```

```bash
docker exec -i -e PGOPTIONS="-c trame.demo_organization=$ORGANIZATION_ID -c trame.demo_site=$SITE_ID" \
  trame-shared-postgres-1 psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d trame_staging \
  < /opt/trame/source/infra/staging/unload-demo.sql
```

### Livraison continue : mise en place (une fois)

Une clé SSH réservée à GitHub, qui ne peut lancer que `deploy <commit>` ou `rollback` (ADR-0035). Prérequis : cette procédure est fusionnée sur `main`, et le clone du VPS est sur un commit qui la contient (`/opt/trame/source/infra/staging/remote/` existe).

**Sur le poste**, la clé, sans phrase de passe puisque GitHub l'utilise seul :

```bash
ssh-keygen -t ed25519 -N '' -C trame-deploy-github -f ~/.ssh/trame-deploy-github
scp ~/.ssh/trame-deploy-github.pub ubuntu@staging.trame.wkhach.dev:/tmp/trame-deploy-github.pub
```

**Sur le VPS**, en root : l'utilisateur, sans mot de passe, et sa clé limitée à la commande imposée.

```bash
useradd --create-home --shell /bin/bash trame-deploy
install -d -m 700 -o trame-deploy -g trame-deploy /home/trame-deploy/.ssh
printf 'restrict,command="/usr/local/sbin/trame-deploy-ssh" %s\n' "$(cat /tmp/trame-deploy-github.pub)" > /home/trame-deploy/.ssh/authorized_keys
chown trame-deploy:trame-deploy /home/trame-deploy/.ssh/authorized_keys
chmod 600 /home/trame-deploy/.ssh/authorized_keys
rm /tmp/trame-deploy-github.pub
```

Les deux scripts, copiés hors du clone, et le seul droit `sudo` de cet utilisateur :

```bash
install -o root -g root -m 755 /opt/trame/source/infra/staging/remote/trame-deploy-ssh /usr/local/sbin/trame-deploy-ssh
install -o root -g root -m 755 /opt/trame/source/infra/staging/remote/trame-deploy /usr/local/sbin/trame-deploy
echo 'trame-deploy ALL=(root) NOPASSWD: /usr/local/sbin/trame-deploy' > /etc/sudoers.d/trame-deploy
chmod 440 /etc/sudoers.d/trame-deploy
visudo -cf /etc/sudoers.d/trame-deploy
sshd -T | grep -i -E '^(allowusers|allowgroups) '
```

Attendu : `parsed OK`, et aucune ligne `allowusers` ni `allowgroups`. Si l'une apparaît, y ajouter `trame-deploy` avant de continuer. L'empreinte du serveur, à comparer plus bas :

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

**Sur le poste**, la clé refusée hors de sa commande, puis l'empreinte du VPS lue par le réseau :

```bash
ssh -i ~/.ssh/trame-deploy-github -o IdentitiesOnly=yes trame-deploy@staging.trame.wkhach.dev bash
ssh-keyscan -t ed25519 staging.trame.wkhach.dev 2>/dev/null > /tmp/trame-known-hosts
ssh-keygen -lf /tmp/trame-known-hosts
```

Attendu : `Commande refusée : seules « deploy <commit complet> » et « rollback » sont acceptées.`, puis la même empreinte `SHA256:` que sur le VPS. Une empreinte différente arrête tout.

L'environnement `staging`, approuvé par Kim seul et réservé à `main`, puis ses deux secrets :

```bash
gh api -X PUT repos/hachwilliam89-spec/trame/environments/staging -F "reviewers[][type]=User" -F "reviewers[][id]=$(gh api user --jq .id)" -F "deployment_branch_policy[protected_branches]=true" -F "deployment_branch_policy[custom_branch_policies]=false"
gh secret set STAGING_DEPLOY_KEY --env staging < ~/.ssh/trame-deploy-github
gh secret set STAGING_KNOWN_HOSTS --env staging < /tmp/trame-known-hosts
rm /tmp/trame-known-hosts
```

Premier usage : un déploiement (« Déployer une nouvelle version »). `rollback-staging.yml` n'est pas un essai : il change la version en service. Viser la version déjà en service est sans surprise : `deploy.sh` la redéploie (sauvegarde, aucune migration, mêmes images) et `previous` ne change pas (README, « Succès »).

Retour arrière, sur le VPS : `userdel -r trame-deploy`, `rm /usr/local/sbin/trame-deploy-ssh /usr/local/sbin/trame-deploy /etc/sudoers.d/trame-deploy`. Sur le poste : `gh secret delete STAGING_DEPLOY_KEY --env staging`, `gh secret delete STAGING_KNOWN_HOSTS --env staging`, `rm ~/.ssh/trame-deploy-github ~/.ssh/trame-deploy-github.pub`.

### Revenir à la version précédente

`/opt/trame/source/infra/staging/deploy.sh --rollback` : la version précédente est vérifiée de nouveau, puis redéployée sans migration.

### Migration en échec

Les services restent sur la version en service : rien ne presse. Diagnostic et commande `migrate status` : README, « Échecs et retours arrière ». Restaurer la sauvegarde prise avant la migration **(non répété, à éprouver avec US-008)** :

```bash
docker compose -p trame-staging stop
docker exec -i trame-shared-postgres-1 pg_restore -U postgres -d trame_staging --clean --if-exists \
  < /opt/trame/staging/backups/<fichier>.dump
/opt/trame/source/infra/staging/deploy.sh "$(cat /opt/trame/staging/releases/current)"
```

### Réinitialiser le TOTP d'un compte

Par le tunnel, realm `trame-staging`, Users, le compte :

1. Credentials : supprimer la ligne `otp`.
2. Sessions : « Sign out all sessions ».

À sa prochaine connexion, Keycloak impose un nouvel enrôlement (vérifié par `staging-realm.integration.spec.ts`). Un jeton d'accès déjà émis reste valide jusqu'à son expiration, 5 minutes au plus : la fermeture des sessions empêche son renouvellement, pas son usage.

### Modifier le realm de staging **(non répété)**

`--import-realm` n'importe un realm que s'il est absent : un changement du fichier généré ne s'applique pas à un realm existant. Reporter le changement à la main dans la console, par le tunnel, à l'identique du fichier `infra/keycloak/generated/trame-staging-realm.json`. À outiller si le besoin se répète.

### Mettre à jour la stack partagée

Après une PR qui change `shared.yml` ou l'image de Keycloak, répétée en CI :

```bash
git -C /opt/trame/source fetch origin main && git -C /opt/trame/source checkout --detach "$SHA"
cd /opt/trame/source
export TRAME_SECRETS_DIR=/opt/trame/shared/secrets KEYCLOAK_ADMIN_URL=http://127.0.0.1:18080
docker compose -f infra/compose/shared.yml build keycloak
docker compose -f infra/compose/shared.yml up -d --wait
```

Retour arrière : replacer le clone sur le commit précédent, puis relancer les deux dernières commandes. Vaut pour une version corrective de PostgreSQL ; une version majeure demande sa propre procédure.

### Retirer le staging

```bash
docker compose -p trame-staging down
docker compose -p trame-shared down
```

Les conteneurs sont retirés, les volumes et les secrets gardés : un nouveau déroulé reprend à l'étape 5. Pour tout effacer, données comprises : `docker compose -p trame-shared down --volumes`, `rm -rf /opt/trame`, puis supprimer les deux enregistrements DNS.
