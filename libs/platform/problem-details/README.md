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

- `invalidRequest(errors)` : erreur `400` qui liste les champs invalides dans `errors` (`pointer`, `detail`, `code`). `ZodValidationPipe` l'utilise.

## Traduire les erreurs métier

Le domaine et les use cases ignorent HTTP. Le contrôleur déclare quelle erreur devient quelle réponse, avec `ErrorMappingInterceptor` :

```ts
const siteErrorMappings: ErrorMapping[] = [
  // Problème : le message de l'erreur devient le `detail`.
  { error: SiteNotFoundError, status: 404 },
  {
    error: SiteCodeAlreadyUsedError,
    status: 409,
    type: problemTypes.siteCodeAlreadyUsed,
    title: 'Code de site déjà utilisé',
  },
  // Champ invalide : rendu comme une erreur de validation du schéma (400 avec `errors`).
  { error: UnknownTimeZoneError, pointer: '#/timeZone', code: 'unknown_time_zone' },
];

@Controller('sites')
@UseInterceptors(new ErrorMappingInterceptor(siteErrorMappings))
export class SitesController {}
```

- La première correspondance gagne, sous-classes comprises.
- Une erreur sans correspondance remonte telle quelle : `500` générique, sans son message.
- Le message d'une erreur traduite est renvoyé au client : il est rédigé pour l'utilisateur, en français, sans donnée personnelle.

## Types de problème

Un `type` spécifique est une URI stable, documentée, propre au projet qui l'emploie. Cette lib n'en définit aucun. Sans `type`, le problème vaut `about:blank` : seul le statut HTTP compte.
