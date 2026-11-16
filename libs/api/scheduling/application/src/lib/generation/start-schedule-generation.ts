import {
  composeSchedulingProblem,
  DEMO_SOLVE_PARAMETERS,
  ensureWeekStartsOnMonday,
  isSameWeek,
  type ScheduleGeneration,
} from '@trame/api/scheduling/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import type { IdempotencyKey } from '@trame/platform/idempotency';
import { prepareOutboxMessage } from '@trame/platform/outbox';
import type { ScheduleRequestedV1 } from '@trame/shared/contracts';
import { IdempotencyKeyReusedError, SiteNotFoundError } from './generation.errors';
import type { ScheduleGenerations } from './schedule-generations';
import type { WeekPlanningSource } from './week-planning-source';

export interface StartScheduleGenerationCommand {
  organizationId: string;
  siteId: string;
  /** Lundi de la semaine. */
  weekStartsOn: Temporal.PlainDate;
  key: IdempotencyKey;
}

/** Fige le problème de la semaine et le confie au moteur par l'outbox, sans calculer ici. */
export class StartScheduleGeneration {
  constructor(
    private readonly generations: ScheduleGenerations,
    private readonly planning: WeekPlanningSource,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: StartScheduleGenerationCommand): Promise<ScheduleGeneration> {
    ensureWeekStartsOnMonday(command.weekStartsOn);
    // Une demande rejouée rend la génération d'origine, même si les besoins ont changé depuis.
    const previous = await this.generations.findByKey(command.organizationId, command.key);
    if (previous !== undefined) {
      return sameRequestOrThrow(previous, command);
    }
    const generation = await this.prepare(command);
    const message = prepareOutboxMessage<ScheduleRequestedV1['payload']>(
      {
        organizationId: generation.organizationId,
        type: 'scheduling.schedule-requested.v1',
        payload: {
          generationId: generation.id,
          problem: generation.problem,
          parameters: generation.parameters,
        },
      },
      this.clock,
      this.ids,
    );
    const registered = await this.generations.register({ generation, key: command.key, message });
    // Deux demandes simultanées sur la même clé : la gagnante doit porter la même semaine.
    return sameRequestOrThrow(registered, command);
  }

  private async prepare(command: StartScheduleGenerationCommand): Promise<ScheduleGeneration> {
    const planning = await this.planning.read(
      command.organizationId,
      command.siteId,
      command.weekStartsOn,
    );
    if (planning === undefined) {
      throw new SiteNotFoundError();
    }
    const { problem, excludedEmployees } = composeSchedulingProblem(planning);
    return {
      id: this.ids.next(),
      organizationId: command.organizationId,
      siteId: command.siteId,
      weekStartsOn: command.weekStartsOn,
      status: 'QUEUED',
      problem,
      parameters: DEMO_SOLVE_PARAMETERS,
      excludedEmployees,
      createdAt: this.clock.now(),
    };
  }
}

function sameRequestOrThrow(
  generation: ScheduleGeneration,
  command: StartScheduleGenerationCommand,
): ScheduleGeneration {
  if (!isSameWeek(generation, command.siteId, command.weekStartsOn)) {
    throw new IdempotencyKeyReusedError();
  }
  return generation;
}
