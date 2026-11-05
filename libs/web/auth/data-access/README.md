# Authentification web

`WebSession` expose l'identité et l'état de session par signals. `IdentityDriver` isole le fournisseur ; `KeycloakDriver` utilise le SDK officiel, initialisé avant Angular. Ces adaptateurs et cette façade évitent de mêler OIDC aux composants.

Code + PKCE S256, URI de retour exact `/oidc-callback`, aucun mot de passe traité par Angular. Access token et refresh token restent en mémoire dans le SDK. Son état temporaire OAuth/PKCE ne doit pas être confondu avec un stockage persistant des jetons.

Le jeton est demandé seulement avant un appel API. Une expiration ou un changement de sujet/organisation ferme la session applicative ; la page propose une reconnexion. Les rôles côté navigateur pilotent l'affichage, l'API reste l'autorité d'autorisation.

`config.json` est une configuration publique, sans secret. HTTP est autorisé pour le fournisseur uniquement en loopback ; les autres origines exigent HTTPS. Le chemin d'API reste relatif. Voir ADR-0033.

La déconnexion utilise le mode POST du SDK, pour ne pas placer `id_token_hint` dans l’URL. La CSP autorise le formulaire uniquement vers l’origine Keycloak configurée et l’origine courante.
