# ADR-0023 — Mobile : PWA d'abord, Capacitor pour Android ensuite

- **Statut** : Accepté (2026-11-01). Remplace la partie mobile d'ADR-0009.
- **Contexte** : une app iOS native demande un compte Apple Developer (99 $/an) pour les notifications push et la publication. Les notifications web fonctionnent sur iOS pour les PWA installées, depuis iOS 16.4.
- **Décision** :
  - v0.2 : une PWA installable (manifest, service worker, notifications web), sur le même code que le web.
  - Ensuite : un build Android avec Capacitor.
  - App iOS native hors périmètre tant que le coût n'est pas justifié.
- **Conséquences** :
  - (+) Aucun coût, un seul code, aucune validation de store.
  - (−) Sur iOS, l'expérience reste celle d'une PWA.
