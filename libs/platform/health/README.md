# `@trame/platform/health`

Sondes de santé pour Docker Compose et Traefik (`@nestjs/terminus`).

- `GET health/live` : le processus répond. Aucune dépendance vérifiée.
- `GET health/ready` : chaque `ReadinessIndicator` enregistré répond. Sinon `503` en problem+json, avec l'état de chaque dépendance dans `checks`, sans aucun détail interne (adresse, message d'erreur).
- Une dépendance indisponible est journalisée en `warn` : nom de l'indicateur, type d'erreur et pile, sans le message.
- `HealthModule.forRoot({ imports?, indicators? })`.

## Ajouter une dépendance

```ts
@Injectable()
export class DatabaseReadiness implements ReadinessIndicator {
  readonly name = 'database';
  constructor(private readonly prisma: PrismaService) {}
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}

HealthModule.forRoot({ imports: [DatabaseModule], indicators: [DatabaseReadiness] });
```

Dépend de `@trame/platform/problem-details` : importer `ProblemDetailsModule` dans l'application.
