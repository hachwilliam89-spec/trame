# ADR-0019 — Temps : UTC en base, fuseau du site pour les calculs

- **Statut** : Accepté (2026-11-01)
- **Contexte** : en France, une nuit de changement d'heure dure 7 h ou 9 h. Calculées avec des dates naïves, les règles de durée et de repos deviennent fausses deux fois par an, sur un sujet de conformité légale.
- **Décision** :
  - Les instants sont stockés en UTC (`timestamptz`). Chaque site porte un fuseau IANA (`Europe/Paris`).
  - Jours, semaines ISO et durées se calculent dans le fuseau du site.
  - Aucune date naïve. En TypeScript, une seule bibliothèque de dates avec fuseaux, choisie au scaffolding. En Python, `zoneinfo`.
  - L'heure courante passe par un port `Clock`, injectable et figé dans les tests. `new Date()` est interdit par une règle de lint hors de l'adaptateur d'horloge.
  - Chaque règle de durée a un test sur une nuit de changement d'heure, des deux côtés.
- **Conséquences** :
  - (+) Conformité correcte toute l'année, et tests reproductibles.
  - (−) Une discipline à tenir, vérifiée par le lint.
