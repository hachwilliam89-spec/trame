# ADR-0010 — Keycloak pour l'authentification

- **Statut** : Accepté
- **Contexte** : il faut des rôles (manager, employé, admin), du multi-tenant à terme, et un standard d'entreprise.
- **Décision** : Keycloak en OIDC, avec un realm par environnement.
- **Conséquences** :
  - (+) Standard, SSO, MFA disponible, rien à coder côté sécurité des mots de passe.
  - (−) Environ 1 Gio de RAM, et une configuration à versionner (export du realm).
- **Alternatives écartées** : une auth maison avec JWT (risque de sécurité) ; un IdP SaaS (dépendance externe).
