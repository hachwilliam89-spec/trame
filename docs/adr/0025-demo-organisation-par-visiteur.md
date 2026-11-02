# ADR-0025 — Démo publique : une organisation éphémère par visiteur

- **Statut** : Accepté (2026-11-01), issu de la revue croisée de Codex
- **Contexte** : avec des comptes démo partagés, un visiteur verrait les modifications et les jobs des autres, et pourrait épuiser les ressources de tous.
- **Décision** :
  - « Entrer en manager » ou « Entrer en employé » crée une organisation de démo dédiée, copiée du jeu de démo, avec son propre `organizationId`. L'isolation repose sur le même mécanisme que le multi-tenant (ADR-0022).
  - L'organisation est purgée 24 h après sa création.
  - Des quotas par organisation : une génération à la fois, taille de problème bornée, nombre de générations par heure limité.
  - La production reste fermée au public (authentification au niveau de Traefik) jusqu'à la connexion OIDC (US-020) et la protection de la démo (US-092).
- **Conséquences** :
  - (+) Aucune fuite entre visiteurs, et une démonstration concrète du multi-tenant.
  - (−) Un job de copie et de purge à maintenir, et un plafond global d'organisations actives à fixer.
