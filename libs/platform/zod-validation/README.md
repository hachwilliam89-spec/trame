# `@trame/platform/zod-validation`

Validation des entrées de l'API avec les schémas zod partagés (ADR-0018). Remplace `nestjs-zod`, incompatible avec NestJS 12.

- `ZodValidationPipe(schema)` : renvoie la valeur parsée (valeurs par défaut comprises), ou lève une `ProblemDetailsException` `400`.
- Les champs invalides sont listés dans l'extension `errors` : `{ pointer, detail, code }`, où `pointer` est un JSON Pointer (`#/shifts/0/label`).
- Les messages suivent la locale zod configurée au démarrage (`z.config(fr())` dans l'API).

## Usage

```ts
@Post()
create(@Body(new ZodValidationPipe(createSiteRequest)) body: CreateSiteRequest) {
  // body est typé et validé
}
```

Dépend de `@trame/platform/problem-details`.
