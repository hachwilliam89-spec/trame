# ADR-0009 — Angular + CDK + Tailwind, design system maison ; mobile Ionic/Capacitor

- **Statut** : Accepté, partie mobile remplacée par ADR-0023
- **Contexte** : le design doit être professionnel sans être générique. Le mobile doit réutiliser les compétences et le code existants.
- **Décision** :
  - web : Angular (standalone, signals, zoneless) avec Angular CDK et Tailwind, sur des design tokens issus du kit de marque ;
  - mobile : Ionic + Capacitor dans le même monorepo.
- **Conséquences** :
  - (+) Identité propre, accessibilité maîtrisée via le CDK, partage des libs avec le mobile.
  - (−) Plus de composants à construire soi-même.
- **Alternatives écartées** : Angular Material (look générique) ; Flutter ou React Native (une deuxième stack front).
