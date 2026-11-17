import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { IdempotencyKey } from '@trame/platform/idempotency';
import type { OutboxMessage } from '@trame/platform/outbox';
import type { ScheduleRequestedV1 } from '@trame/shared/contracts';

export interface ScheduleGenerationRequest {
  generation: ScheduleGeneration;
  key: IdempotencyKey;
  message: OutboxMessage<ScheduleRequestedV1['payload']>;
}

export interface ScheduleGenerations {
  /** Crée la génération et son message ensemble, ou rend celle de cette organisation et cette clé. */
  register(request: ScheduleGenerationRequest): Promise<ScheduleGeneration>;
  findByKey(organizationId: string, key: IdempotencyKey): Promise<ScheduleGeneration | undefined>;
  findById(organizationId: string, generationId: string): Promise<ScheduleGeneration | undefined>;
  /**
   * Le dernier essai et le dernier planning exploitable d'une semaine, lus dans un même état de la
   * base : une génération qui se termine pendant la lecture n'y figure jamais sous deux états.
   */
  latestOfWeek(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeekScheduleGenerations>;
}

export interface WeekScheduleGenerations {
  /** Dernière génération lancée, quel que soit son état. */
  latestAttempt: ScheduleGeneration | undefined;
  /** Dernière génération terminée avec un planning (`OPTIMAL` ou `FEASIBLE`). */
  latestSchedule: ScheduleGeneration | undefined;
}
