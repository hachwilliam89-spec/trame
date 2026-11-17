import type { Clock } from '@trame/platform/clock';
import type { DemoLoadingSteps } from './demo-loading-steps';
import { DEMO_TIME_ZONE, demoWarehouse } from './demo-warehouse';
import { DemoWarehouseWriter } from './demo-warehouse-writer';
import { nextMondayAfter, todayIn } from './demo-week';

/**
 * Unité de travail d'un chargement : `work` s'exécute tout ou rien, et un seul chargement à la
 * fois par organisation (ADR-0038).
 */
export interface DemoUnitOfWork {
  run<Result>(
    organizationId: string,
    work: (steps: DemoLoadingSteps) => Promise<Result>,
  ): Promise<Result>;
}

/** L'organisation a déjà un site : le jeu n'est chargé que dans une organisation vide. */
export class DemoAlreadyLoadedError extends Error {
  constructor(readonly organizationId: string) {
    super(
      `L'organisation ${organizationId} a déjà un site : le jeu de démonstration n'a pas été chargé.`,
    );
    this.name = 'DemoAlreadyLoadedError';
  }
}

/** Ce que l'écran Planning ouvre directement : le site chargé et la semaine à calculer. */
export interface LoadedDemoWarehouse {
  siteId: string;
  weekStartsOn: Temporal.PlainDate;
}

/**
 * Charge l'entrepôt de démonstration dans une organisation sans site, pour la semaine qui
 * commence le lundi suivant à Paris. Les contrats commencent le jour du chargement.
 */
export class LoadDemoWarehouse {
  constructor(
    private readonly unitOfWork: DemoUnitOfWork,
    private readonly clock: Clock,
  ) {}

  execute(organizationId: string): Promise<LoadedDemoWarehouse> {
    const today = todayIn(this.clock.now(), DEMO_TIME_ZONE);
    const weekStartsOn = nextMondayAfter(today);
    const warehouse = demoWarehouse(weekStartsOn, today);

    return this.unitOfWork.run(organizationId, async (steps) => {
      const existingSites = await steps.listSites.execute({ organizationId, page: { limit: 1 } });
      if (existingSites.items.length > 0) {
        throw new DemoAlreadyLoadedError(organizationId);
      }
      const writer = new DemoWarehouseWriter(steps, organizationId);
      const siteId = await writer.write(warehouse, weekStartsOn);
      return { siteId, weekStartsOn };
    });
  }
}
