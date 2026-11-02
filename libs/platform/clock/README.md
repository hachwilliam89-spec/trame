# `@trame/platform/clock`

Port d'horloge (ADR-0019) : l'heure courante n'est lue qu'à travers lui, pour que le code soit testable et que les tests soient reproductibles.

- `Clock` : le port, `now(): Temporal.Instant`.
- `SystemClock` : l'adaptateur système. C'est le seul fichier autorisé à lire l'heure réelle ; la règle ESLint interdit `new Date()`, `Date()`, `Date.now()` et `Temporal.Now` partout ailleurs.
  - Il donne l'instant à la milliseconde, la précision que stocke PostgreSQL (`timestamptz(3)`) : un objet relu en base a la même date que celui qui vient d'être créé.
- `FixedClock` : horloge figée pour les tests, avec `set()` et `advance()`.
- `ClockModule` (NestJS, global) : fournit `SystemClock` sous le jeton `CLOCK`.

## Usage

```ts
@Injectable()
export class PublishSchedule {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  execute() {
    const publishedAt = this.clock.now();
    // ...
  }
}
```

Dans un test : `overrideProvider(CLOCK).useValue(new FixedClock('2026-10-25T00:30:00Z'))`.

Les dates utilisent Temporal (ADR-0027), natif dans Node 26.
