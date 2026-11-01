# ADR-0011 — Docker Compose + Traefik sur le VPS, pas de Kubernetes en v1

- **Statut** : Accepté
- **Contexte** : un seul VPS (6 vCPU, 11 Gio).
- **Décision** : Docker Compose par environnement, derrière le Traefik mutualisé du VPS (TLS Let's Encrypt automatique, routage par sous-domaine, voir ADR-0016).
- **Conséquences** :
  - (+) Simple, proportionné, rapide à déployer.
  - (−) Pas de haute disponibilité. Un déploiement provoque une courte indisponibilité, réduite par les healthchecks.
- **Alternatives écartées** : k3s en mono-nœud (vitrine sans bénéfice réel, et une consommation qui grignote la marge de RAM).
