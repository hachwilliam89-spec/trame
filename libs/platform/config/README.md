# `@trame/platform/config`

Configuration validée au démarrage par un schéma zod : une variable manquante ou invalide bloque le lancement, avec la liste des variables fautives.

- `ConfigModule.forRoot({ schema, envFilePath? })` : enveloppe `@nestjs/config`, global. Aucun fichier `.env` n'est lu par défaut ; en production, l'environnement vient de Docker Compose.
- `validateEnv(schema, env)` : la même validation, sans NestJS (scripts, tests).
- `ConfigValidationError` : levée au démarrage, message lisible.

## Usage

```ts
const envSchema = z.object({
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
});

@Module({ imports: [ConfigModule.forRoot({ schema: envSchema })] })
export class AppModule {}

// Lecture typée
constructor(private readonly config: ConfigService<z.output<typeof envSchema>, true>) {}
this.config.get('PORT', { infer: true });
```

Le schéma appartient à l'application, jamais à cette lib.
