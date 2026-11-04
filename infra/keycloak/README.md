# Keycloak local — US-020 A2

Le realm `trame` permet de tester la même vérification OIDC que l'API utilisera avec un
fournisseur configuré. Il est importé par `infra/compose/dev.yml`, avec une image
Keycloak **26.8.1 figée par digest**.

## Démarrer et se connecter

`pnpm nx run infra:up` démarre Keycloak avec PostgreSQL et RabbitMQ, attend leur état
sain puis applique les migrations de l'API. Pour une copie existante du dépôt, ajouter
les nouvelles variables de `.env.example` dans son `.env` avant de relancer la commande.

- Compte utilisateur : [console du compte](http://127.0.0.1:8080/realms/trame/account/).
- Administration du serveur : [console d'administration](http://127.0.0.1:8080/admin/),
  avec `KEYCLOAK_ADMIN_USER` et `KEYCLOAK_ADMIN_PASSWORD` du `.env`.
- Les comptes applicatifs sont `dev-admin`, `dev-manager` et `dev-employee`, avec le mot
  de passe public de développement `trame-local-only`.
- Ils portent respectivement `admin`, `manager` et `employee`, et l'organisation fictive
  `019a4ac0-0000-7000-8000-000000000001`.

Ces identifiants et ce realm sont réservés au poste local. Ils ne sont pas une base de
configuration pour staging ou production (US-005). Le rôle applicatif `admin` ne donne
aucun droit sur l'administration Keycloak ; le compte bootstrap est distinct.

Le client `trame-dev` prévoit un callback exact
`http://127.0.0.1:4200/oidc-callback`, paramétré par `KEYCLOAK_DEV_REDIRECT_URI`.
L'écran Angular de connexion sera livré avec US-020 B. Les tests A2 utilisent un petit
serveur de callback sur un port libre, pas un écran Angular simulé comme déjà livré.
`webOrigins` reste fixé à `http://127.0.0.1:4200`. Les tests échangent le code côté Node :
ils ne valident pas encore le CORS d'une connexion depuis le front. Si son origine change,
adapter aussi `webOrigins` et vérifier ce parcours avec US-020 B.

## De la connexion à l'API

1. Le navigateur est redirigé vers Keycloak avec un challenge PKCE `S256`.
2. Keycloak authentifie l'utilisateur et renvoie un code au callback autorisé.
3. Le client échange ce code et son vérificateur PKCE contre un jeton d'accès.
4. L'API vérifie la signature, l'émetteur, l'audience et les revendications obligatoires
   avec le résolveur existant (ADR-0030).

Le client n'autorise ni flux implicite ni password grant. Le client intégré `admin-cli`
du realm applicatif est désactivé aussi : le test a montré qu'il permettait sinon
d'obtenir un jeton par mot de passe. Cela ne désactive pas l'administration du serveur
dans le realm `master`.

Les mappers du client ajoutent :

| Valeur du jeton      | Origine                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `organization_id`    | attribut utilisateur géré par l'administration du realm             |
| `roles`              | rôles du realm, avec portée limitée aux trois rôles applicatifs     |
| audience `trame-api` | mapper d'audience explicite                                         |
| `sub`                | scope standard `basic`, indispensable pour identifier l'utilisateur |

Les comptes ont aussi `manage-account` et `view-profile` du client `account` pour leur
propre profil. Ces rôles ne donnent pas de droit sur les autres utilisateurs ou le realm.

## Protection de l'organisation et des rôles

Le profil utilisateur est déclaré dans le composant `declarative-user-profile` du fichier
d'import. Son champ `kc.user.profile.config` est une chaîne JSON parce que le format
d'import Keycloak l'exige.

- `organization_id` est lisible et modifiable uniquement dans le contexte administratif
  du profil. Le mot `admin` dans ces permissions désigne ce contexte, pas le rôle
  applicatif portant le même nom.
- Les attributs non déclarés sont désactivés. En **26.8.1**, cette politique vaut
  `null` : l'enum `DISABLED` montré dans la documentation courante fait échouer l'import.
- Le champ standard `email` reste déclaré, sans être obligatoire pour ces comptes.
- Une modification d'organisation par l'API du compte est refusée ; un jeton renouvelé
  conserve l'organisation et le rôle d'origine. L'API d'administration refuse aussi
  qu'un employé s'attribue un rôle.

## Ports et remise à zéro

Seul le port HTTP 8080 est publié, sur `127.0.0.1`. Le healthcheck interroge
`/health/ready` sur le port de management 9000, qui reste interne.

Si `KEYCLOAK_PORT` change, adapter aussi `OIDC_ISSUER_URL` et `OIDC_JWKS_URL` dans le
`.env`. La redirection du client se règle séparément avec `KEYCLOAK_DEV_REDIRECT_URI`.

Keycloak n'a **pas de volume de données** en développement. Un simple redémarrage du
conteneur garde son état ; sa suppression puis recréation réimporte le fichier et perd
les sessions et modifications locales. Pour réimporter le realm après édition :

```bash
docker compose --env-file .env -f infra/compose/dev.yml up -d --force-recreate --wait keycloak
```

Les volumes PostgreSQL et RabbitMQ sont conservés par `infra:down` ; `infra:reset` les
supprime explicitement.

## Tests et sources

```bash
pnpm exec playwright install chromium
pnpm nx run infra:integration
```

La CI installe Chromium avec ses dépendances système. Le test utilise de vrais services
sur des ports libres, un nom de projet Compose dédié et l'API construite. Aucun jeton
ni code d'autorisation n'est imprimé ou conservé comme artefact.

- [Import au démarrage](https://www.keycloak.org/server/importExport).
- [Healthchecks et absence de curl dans l'image](https://www.keycloak.org/observability/health).
- [Scopes et mapper du sujet](https://www.keycloak.org/docs/latest/server_admin/index.html#_pairwise-sub-mapper).
- [Politique des attributs en 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/core/src/main/java/org/keycloak/representations/userprofile/config/UPConfig.java).
- [Traitement des attributs en 26.8.1](https://github.com/keycloak/keycloak/blob/26.8.1/server-spi-private/src/main/java/org/keycloak/userprofile/DefaultAttributes.java).
