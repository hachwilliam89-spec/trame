# `@trame/platform/logging`

Logs JSON structurés via `nestjs-pino` : une ligne par requête HTTP, avec son identifiant.

- `LoggingModule.forRoot(options)` / `forRootAsync({ inject, useFactory })`.
- Options : `level`, `pretty` (sortie lisible en local), `redact` (chemins à masquer en plus), `quietPaths` (requêtes réussies non journalisées, pour les healthchecks).
- Requête journalisée champ par champ (`serializeRequest`) : identifiant, méthode, chemin sans query string, et les seuls en-têtes de `LOGGED_REQUEST_HEADERS` (`User-Agent`, `Content-Type`, `Content-Length`). Ni paramètres, ni adresse IP, ni autre en-tête : un en-tête libre comme `X-Forwarded-Uri` peut porter une query string.
- Réponse journalisée par son seul statut (`serializeResponse`).
- Masqués en défense en profondeur, si une requête brute est journalisée ailleurs : `Authorization`, `Cookie`, `X-Api-Key`, `Referer`, `Set-Cookie` (`[masqué]`).
- `X-Request-Id` : repris s'il est sûr (8 à 128 caractères `[A-Za-z0-9_-]`), généré sinon, et renvoyé dans la réponse.
- Niveau par statut : `info` (2xx-3xx), `warn` (4xx), `error` (5xx).

## Usage

```ts
// app.module.ts
LoggingModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    level: config.get('LOG_LEVEL', { infer: true }),
    pretty: config.get('NODE_ENV', { infer: true }) === 'development',
    quietPaths: ['/api/v1/health'],
  }),
});

// main.ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
```

Jamais de donnée personnelle en clair dans un log : ajoutez les chemins concernés à `redact`. L'identifiant de trace OpenTelemetry arrivera avec US-007.
