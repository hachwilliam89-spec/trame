# Marque Trame

Jetons du design system « Trame » : couleurs clair/sombre, polices, espacements, angles et ombre du symbole (`src/tokens.css`). La référence visuelle est l'artefact Design System « Trame » de Kim (révision du 16 novembre 2026) : règles d'usage, composants et maquettes des écrans clés. Seuls les jetons déjà employés par l'application sont déclarés ici ; les teintes des créneaux et le statut « conforme » arriveront avec la grille du planning.

## Logo

Le symbole aux cinq T tissés et le mot-symbole sont servis par `apps/web/public` ; leurs sources sont dans `docs/brand/logo-v2/`. Ne pas déformer, recolorer ni ajouter d'effet au logo. En thème sombre, chaque fil tient au moins 3:1 sur `weave-ground` et sur `surface`.

## Polices

- Titres : Bricolage Grotesque (variable), pour `h1` et `h2` seulement.
- Texte : IBM Plex Sans 400, 500 et 600.
- Heures, durées et mesures : IBM Plex Mono 400 et 500, chiffres tabulaires.

Les trois familles (SIL OFL 1.1) viennent des paquets `@fontsource` et sont servies par l'application : la CSP (`font-src 'self'`) refuse toute autre origine, Google Fonts comprise. IBM Plex se limite au sous-ensemble latin. Le test d'intégration du front vérifie leur chargement dans l'application construite, sous sa CSP.
