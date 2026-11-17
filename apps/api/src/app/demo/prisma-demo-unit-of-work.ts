import { type Database, type PrismaService, runAtomically } from '@trame/api/database';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import {
  type DemoLoadingSteps,
  assembleDemoLoadingSteps,
  prismaDemoRepositories,
} from './demo-loading-steps';
import type { DemoUnitOfWork } from './load-demo-warehouse';

/** Mesuré sous la seconde sur PostgreSQL local ; la marge couvre un VPS chargé. */
const LOADING_TIMEOUT_MS = 30_000;

/**
 * Chargement dans une transaction PostgreSQL, assemblé sur son client (ADR-0038). Un verrou
 * consultatif par organisation, pris en premier, fait attendre un second chargement simultané :
 * il ne vérifie l'absence de site qu'après la validation du premier, et le voit.
 */
export class PrismaDemoUnitOfWork implements DemoUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  run<Result>(
    organizationId: string,
    work: (steps: DemoLoadingSteps) => Promise<Result>,
  ): Promise<Result> {
    return runAtomically(this.prisma, { timeoutMs: LOADING_TIMEOUT_MS }, async (database) => {
      await lockDemoLoading(database, organizationId);
      const repositories = prismaDemoRepositories(database);
      return work(assembleDemoLoadingSteps(repositories, this.clock, this.ids));
    });
  }
}

/**
 * Verrou libéré à la fin de la transaction. La clé prend l'UUID en minuscules : PostgreSQL lit
 * toutes ses graphies comme la même organisation. Deux organisations dont les clés auraient le
 * même condensat ne feraient que s'attendre : la vérification du site reste exacte.
 */
async function lockDemoLoading(database: Database, organizationId: string): Promise<void> {
  const key = `trame.demo.${organizationId.toLowerCase()}`;
  await database.client
    .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;
}
