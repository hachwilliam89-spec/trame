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
  /** La dernière génération lancée pour la semaine, quel que soit son état. */
  latestAttempt(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<ScheduleGeneration | undefined>;
  /** La dernière génération terminée avec un planning (`OPTIMAL` ou `FEASIBLE`). */
  latestWithSchedule(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<ScheduleGeneration | undefined>;
}
