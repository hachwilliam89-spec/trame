# Trame web — premier parcours Guidé

Depuis la racine, avec la stack locale et les environnements Node/Python installés :

```bash
pnpm nx run infra:up
pnpm nx serve api
pnpm nx run diagnostic-transport:serve
pnpm nx run engine:worker
pnpm nx serve web
```

Lancer les quatre processus dans des terminaux séparés. Ouvrir **http://127.0.0.1:4200** (origine et callback exacts du realm), puis « Se connecter ». La page Keycloak propose les comptes locaux `dev-admin`, `dev-manager`, `dev-employee`, mot de passe de développement `trame-local-only`. Le rôle employé n'autorise pas le diagnostic.

Si le realm existait avant cette version, recréer uniquement le conteneur Keycloak pour charger son origine de dev : `docker compose --env-file .env -f infra/compose/dev.yml up -d --force-recreate keycloak`. Ses données locales sont réinitialisées comme documenté dans US-020 ; PostgreSQL et RabbitMQ ne sont pas remis à zéro.

`public/config.json` est public et ne porte aucun secret. Pour changer les ports, aligner ce fichier, `proxy.conf.json`, `KEYCLOAK_DEV_REDIRECT_URI` et `KEYCLOAK_DEV_WEB_ORIGIN`. Le serveur Angular relaie `/api` vers NestJS ; le déploiement utilisera le même domaine, derrière Traefik.

La connexion utilise Code + PKCE et garde les jetons en mémoire. La déconnexion envoie le formulaire OIDC en POST vers Keycloak, sans indication de jeton dans l’URL. Après rechargement, « Se connecter » retrouve le SSO et le diagnostic conservé. Le navigateur stocke seulement le marque-page de ce diagnostic par utilisateur/organisation, pas les résultats ni les jetons.

Le suivi est authentifié, ordonné et reprenable. Une panne de suivi ne relance pas le calcul ; un résultat sans solution n'affiche pas d'affectations. Ce test fictif ne génère pas de planning réel.

Vérifications : `pnpm nx test web`, tests des libs `web-auth-data-access` et `web-scheduling-data-access`, puis `pnpm nx run infra:integration`. Installer les navigateurs avec `pnpm exec playwright install chromium firefox webkit` ; le test réel construit Angular et l'API et utilise une stack Docker isolée.

La CSP n'autorise pas eval. L'import `browser-validation` doit précéder la construction des schémas zod ; les styles critiques inline sont désactivés. Voir ADR-0033.
