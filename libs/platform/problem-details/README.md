# `@trame/platform/problem-details`

Erreurs HTTP au format RFC 9457 (`application/problem+json`), pour toute l'API (ADR-0021).

- `ProblemDetailsModule` : enregistre le filtre global. À importer une fois, dans le module racine.
- `ProblemDetailsFilter` : convertit toute erreur.
  - `ProblemDetailsException` : rendue telle quelle, extensions comprises.
  - `HttpException` de NestJS : statut conservé, message repris en `detail`.
  - Autre erreur : `500` générique, sans aucun détail interne.
- Toute réponse 5xx est journalisée par `describeForLog` : type d'erreur et pile d'appels, jamais le message, qui peut contenir un secret. L'identifiant de requête du log permet de retrouver le contexte.
- `problem(init)` : complète `type` (`about:blank` par défaut) et `title` (libellé HTTP du statut).
- `instance` vaut toujours le chemin de la requête, sans la query string.

## Usage

```ts
throw new ProblemDetailsException({
  type: 'https://<domaine>/problems/competence-utilisee',
  status: 409,
  title: 'Compétence utilisée',
  detail: 'La compétence CACES R489 est exigée par le poste Cariste.',
});
```

Un `type` spécifique est une URI stable, documentée, propre au projet qui l'emploie. Cette lib n'en définit aucun.
