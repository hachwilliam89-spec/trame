# ADR-0024 — En-têtes de sécurité : Traefik et CSP du front, pas de helmet

- **Statut** : Accepté (2026-11-01)
- **Contexte** :
  - Traefik pose déjà HSTS, `nosniff`, l'anti-iframe, la politique de referrer et les permissions sur toutes les réponses du VPS.
  - Les réglages par défaut de helmet posent trois problèmes :
    - sa CSP contient `upgrade-insecure-requests`, que Safari applique aussi à `http://localhost` : en dev, les ressources ne chargent plus ;
    - sa CSP casse la page Scalar ;
    - `Cross-Origin-Opener-Policy` gêne les connexions OIDC en popup.
- **Décision** :
  - Pas de helmet. L'API masque seulement `X-Powered-By`.
  - Le front a une CSP écrite à la main, sans `upgrade-insecure-requests` (HSTS force déjà le HTTPS en production). La page Scalar a sa propre CSP.
  - Les tests E2E tournent sur Chromium, Firefox et WebKit, et un scan OWASP ZAP passe sur staging.
- **Conséquences** :
  - (+) Aucun doublon ni réglage contradictoire, et les problèmes propres à Safari sont détectés en CI.
  - (−) La CSP du front est à tenir à jour à chaque nouvelle ressource externe.
