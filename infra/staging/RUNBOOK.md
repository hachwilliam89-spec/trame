# Runbook du staging (US-005 B2b)

Mise en service du staging sur le VPS, pas à pas : chaque commande, ce qu'elle doit afficher, et son retour arrière. Le fonctionnement de `deploy.sh` est décrit dans [README.md](README.md) ; ce document dit dans quel ordre agir.

**Règles**

- Kim approuve et lance chaque commande. Aucun agent n'agit sur le VPS.
- Une sortie différente de l'attendu arrête le déroulé : on diagnostique avant de continuer.
- Sauf mention « sur le poste », les commandes se lancent sur le VPS, en root (`sudo -i`), dans une session `tmux` : une coupure SSH n'interrompt rien, et les variables de l'étape 4 y restent disponibles jusqu'à l'étape 6.
- `<vps>` est l'alias SSH du VPS. `SHA` est le commit de `main` à mettre en service, en 40 caractères : `export SHA=<commit>` au début de la session, sur le poste comme sur le VPS.

**Ce que la répétition a déjà prouvé.** Les étapes 3 à 7 et 9 utilisent les scripts que la répétition du staging joue à chaque passage (`rehearsal.yml`) : installation d'`oras` et de `cosign`, provisionnement, realm `master`, `deploy.sh`. Les étapes marquées **(non répété)** n'ont jamais été jouées : elles demandent plus d'attention.

## 1. Préalables, sans effet sur le VPS

| Contrôle                                 | Commande                                                                             | Attendu                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Durcissement de l'hôte appliqué (US-013) | `scripts/check.sh` du dépôt `vps-edge`, puis `scripts/check-externe.sh` sur le poste | Les deux réussissent                                                                              |
| Outils présents                          | `command -v docker git tar curl python3 openssl tmux`                                | Sept chemins. `tmux` absent : l'installer, ou accepter le risque d'une coupure SSH                |
| Réseau de Traefik                        | `docker network inspect edge --format '{{.Name}}'`                                   | `edge`                                                                                            |
| Seul Traefik publie des ports            | `docker ps --format '{{.Names}}\t{{.Ports}}' \| grep -F -e '->'`                     | Une seule ligne, celle de Traefik                                                                 |
| Tunnel SSH permis                        | `sshd -T \| grep -i allowtcpforwarding`                                              | `yes` ou `local`. Sinon, la console d'administration est injoignable : décider avant de continuer |
| Mémoire avant                            | `free -m`                                                                            | Noter `available` et le swap utilisé : la référence de l'étape 10                                 |

**Répétition finale, sur le poste.** Elle joue la version exacte à mettre en service, avec le script qui la déploiera :

```bash
gh workflow run rehearsal.yml -f version="$SHA"
gh run watch
```

Attendu : le job réussit. Son résumé donne le SHA du script répété, les deux versions et leurs digests. Si une migration sépare `SHA` de la version précédente, la répétition prouve aussi le retour sur le schéma migré. Sans répétition verte sur ce `SHA`, on ne déploie pas.

## 2. DNS (chez OVH)

Créer deux enregistrements `A` vers l'adresse du VPS : `staging.trame.wkhach.dev` et `auth.trame.wkhach.dev`. Un enregistrement `AAAA` seulement si les domaines déjà servis par `vps-edge` en ont un.

```bash
dig +short staging.trame.wkhach.dev auth.trame.wkhach.dev
```

Attendu : l'adresse du VPS, deux fois. Les enregistrements doivent répondre **avant** l'étape 7 : Traefik demande les certificats dès que les routes apparaissent, et Let's Encrypt limite les essais en échec.

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

Les mots de passe sont générés en hexadécimal : plusieurs entrent dans une URL, où les caractères `/`, `+` et `=` du base64 seraient mal lus. Les variables sont exportées pour le provisionnement de l'étape 6, qui les lit dans l'environnement.

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

cd /opt/trame/staging/secrets
database='postgres:5432/trame_staging'
printf 'DATABASE_URL=postgresql://trame_staging_migrator:%s@%s\n' "$TRAME_MIGRATOR_PASSWORD" "$database" > migrator.env
printf 'DATABASE_URL=postgresql://trame_staging_api:%s@%s\n' "$TRAME_API_PASSWORD" "$database" > api.env
printf 'DATABASE_URL=postgresql://trame_staging_api:%s@%s\nAMQP_URL=amqp://trame_staging_relay:%s@rabbitmq:5672/trame-staging\n' \
  "$TRAME_API_PASSWORD" "$database" "$TRAME_RELAY_PASSWORD" > relay.env
printf 'AMQP_URL=amqp://trame_staging_worker:%s@rabbitmq:5672/trame-staging\n' "$TRAME_WORKER_PASSWORD" > worker.env

ls -l /opt/trame/shared/secrets /opt/trame/staging/secrets
```

Attendu : sept fichiers en `-rw-------`, propriétaire root. Aucune valeur ne s'affiche. Les noms et les variables sont ceux des modèles de `infra/compose/secrets.example`.

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

Attendu : `postgres` et `rabbitmq` en `running (healthy)`, sans port publié.

Retour arrière : `docker compose -p trame-shared down` arrête et retire les conteneurs, en gardant les volumes. `down --volumes` détruit les données : seulement avant toute donnée réelle.

## 6. Provisionnement

Dans la même session que l'étape 4. Les scripts sont silencieux quand ils réussissent, et rejouables.

```bash
cd /opt/trame/source
shared() { docker compose -f infra/compose/shared.yml exec -T "$@"; }

shared postgres psql --no-psqlrc -U postgres -d postgres < infra/provisioning/postgres-cluster.sql
shared -e TRAME_KEYCLOAK_DATABASE_PASSWORD postgres psql --no-psqlrc -U postgres -d postgres \
  < infra/provisioning/postgres-keycloak.sql
shared -e TRAME_ENVIRONMENT=staging -e TRAME_MIGRATOR_PASSWORD -e TRAME_API_PASSWORD postgres \
  psql --no-psqlrc -U postgres -d postgres < infra/provisioning/postgres-environment.sql
shared -e TRAME_ENVIRONMENT=staging -e TRAME_RELAY_PASSWORD -e TRAME_WORKER_PASSWORD rabbitmq \
  sh -s < infra/provisioning/rabbitmq-environment.sh
echo "code de sortie : $?"
```

Attendu : aucune sortie des scripts, puis `code de sortie : 0`. Contrôle :

```bash
shared postgres psql -U postgres -Atc '\l' | cut -d'|' -f1 | grep -E '^(keycloak|trame_staging)$'
shared rabbitmq rabbitmqctl -q list_vhosts | grep -x trame-staging
```

Attendu : `keycloak`, `trame_staging`, puis `trame-staging`.

Retour arrière : rien à défaire tant que rien ne s'y connecte. Pour repartir de zéro, `down --volumes` de l'étape 5.

## 7. Keycloak et realm `master`

```bash
docker compose -f infra/compose/shared.yml up -d --wait keycloak
shared keycloak bash -s < infra/provisioning/keycloak-master-realm.sh
echo "code de sortie : $?"
```

Attendu : `keycloak` en `running (healthy)`, puis `code de sortie : 0`. Le script donne au realm `master` l'adresse du tunnel (ADR-0034). Il utilise le compte temporaire : il passe **avant** l'étape 8.

Contrôles, depuis le VPS :

```bash
keycloak_address="$(docker inspect -f '{{(index .NetworkSettings.Networks "edge").IPAddress}}' trame-shared-keycloak-1)"
curl -s "http://$keycloak_address:8080/realms/master/.well-known/openid-configuration" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["issuer"])'
for path in /realms/trame-staging/.well-known/openid-configuration /realms/master/.well-known/openid-configuration /admin/master/console/; do
  curl -s -o /dev/null -w "%{http_code} $path\n" "https://auth.trame.wkhach.dev$path"
done
```

Attendu : `http://127.0.0.1:18080/realms/master`, puis `200` pour le realm de staging et `404` pour les deux autres chemins. Un certificat refusé à ce stade : attendre une minute, Traefik l'obtient à la première requête.

Retour arrière : `docker compose -f infra/compose/shared.yml rm --stop --force keycloak`. Sa base reste dans PostgreSQL.

Les variables de l'étape 4 ne servent plus : `unset TRAME_KEYCLOAK_DATABASE_PASSWORD TRAME_MIGRATOR_PASSWORD TRAME_API_PASSWORD TRAME_RELAY_PASSWORD TRAME_WORKER_PASSWORD`.

## 8. Administrateur permanent **(non répété)**

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
6. Sur le VPS, retirer les deux lignes `KC_BOOTSTRAP_ADMIN_*` de `/opt/trame/shared/secrets/keycloak.env`.

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

Retour arrière : voir « Retirer le staging ».

## 10. Critères de réussite de B2b

Tous doivent être remplis. Sinon, on retire le staging.

1. **Surface.** `docker ps --format '{{.Names}}\t{{.Ports}}' | grep -F -e '->'` ne montre que Traefik. Sur le poste, `scripts/check-externe.sh` de `vps-edge` réussit toujours.
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

1. Sur le poste : répétition verte sur le nouveau `SHA` (étape 1), obligatoire si la version ajoute une migration ou touche `infra/`.
2. `git -C /opt/trame/source fetch origin main && git -C /opt/trame/source checkout --detach "$SHA"`
3. `/opt/trame/source/infra/staging/deploy.sh "$SHA"`

En cas d'échec, le script revient seul à la version en service et le dit. Code 4 : la version restaurée ne répond pas, intervention requise (README, « Codes de sortie »).

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
