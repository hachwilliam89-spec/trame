# ADR-0016 — Proxy HTTP(S) mutualisé du VPS (dépôt vps-edge)

- **Statut** : Accepté (2026-11-01)
- **Contexte** : le VPS héberge déjà KCD Formes et Équilibre (démo mobile). Le Caddy du projet KCD tenait seul les ports 80/443 et routait aussi Équilibre. Mettre Trame derrière lui aurait lié les déploiements de Trame à ceux de KCD.
- **Décision** :
  - Traefik vit dans une stack dédiée (dépôt `vps-edge`, déployé dans `/opt/edge`). C'est le seul conteneur du VPS qui publie les ports 80/443. Il gère Let's Encrypt, la redirection HTTPS, les en-têtes de sécurité et la compression.
  - Chaque projet actif (KCD, Trame) rejoint le réseau externe `edge` et déclare ses routes par labels. Équilibre, figé, est routé par un fichier.
  - Le socket Docker n'est lu qu'à travers un proxy en lecture seule.
  - Règles pour Trame : routeurs et services préfixés `trame-` ; aucune base de données sur le réseau `edge` ; aucun conteneur ne publie de port.
- **Conséquences** :
  - (+) Trame se déploie et se retire sans toucher aux autres projets, et le HTTPS est commun à tout le VPS.
  - (−) Le proxy est un point unique de défaillance pour tout le VPS. C'est mitigé par le healthcheck et `restart: unless-stopped`, et un retour arrière est documenté dans `vps-edge`.
- **Alternatives écartées** :
  - Traefik dans le repo de Trame : couplage inverse, les autres projets dépendraient de Trame ;
  - garder le Caddy de KCD : couplage actuel.
