import { hasSchedule, type ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { IdempotencyKey } from '@trame/platform/idempotency';
import type { ScheduleOutcomeV1 } from '@trame/shared/contracts';
import type {
  ScheduleGenerationRequest,
  ScheduleGenerations,
} from '../lib/generation/schedule-generations';

export class InMemoryScheduleGenerations implements ScheduleGenerations {
  private readonly requests = new Map<string, ScheduleGenerationRequest>();

  async register(request: ScheduleGenerationRequest): Promise<ScheduleGeneration> {
    const key = keyOf(request.generation.organizationId, request.key);
    const existing = this.requests.get(key);
    if (existing !== undefined) {
      return existing.generation;
    }
    this.requests.set(key, request);
    return request.generation;
  }

  async findByKey(
    organizationId: string,
    key: IdempotencyKey,
  ): Promise<ScheduleGeneration | undefined> {
    return this.requests.get(keyOf(organizationId, key))?.generation;
  }

  async findById(
    organizationId: string,
    generationId: string,
  ): Promise<ScheduleGeneration | undefined> {
    return this.all().find(
      (generation) =>
        generation.organizationId === organizationId && generation.id === generationId,
    );
  }

  async latestAttempt(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<ScheduleGeneration | undefined> {
    return this.ofWeek(organizationId, siteId, weekStartsOn).at(-1);
  }

  async latestWithSchedule(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<ScheduleGeneration | undefined> {
    return this.ofWeek(organizationId, siteId, weekStartsOn).filter(hasSchedule).at(-1);
  }

  /** Messages confiés à l'outbox, dans l'ordre d'enregistrement. */
  messages(): ScheduleGenerationRequest['message'][] {
    return [...this.requests.values()].map((request) => request.message);
  }

  /** Simule le rapport `STARTED` du moteur. */
  start(generationId: string): void {
    this.update(generationId, (generation) => ({ ...generation, status: 'RUNNING' }));
  }

  /** Simule le rapport `RESULT` du moteur. */
  finish(generationId: string, result: ScheduleOutcomeV1['result']): void {
    this.update(generationId, (generation) => ({
      ...generation,
      status: 'SUCCEEDED',
      outcome: { result, checkedRules: ['UN_SEUL_SHIFT'], solveSeconds: 0.1 },
      finishedAt: generation.createdAt,
    }));
  }

  private all(): ScheduleGeneration[] {
    return [...this.requests.values()].map((request) => request.generation);
  }

  private ofWeek(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): ScheduleGeneration[] {
    return this.all()
      .filter(
        (generation) =>
          generation.organizationId === organizationId &&
          generation.siteId === siteId &&
          generation.weekStartsOn.equals(weekStartsOn),
      )
      .sort((first, second) => Temporal.Instant.compare(first.createdAt, second.createdAt));
  }

  private update(
    generationId: string,
    change: (generation: ScheduleGeneration) => ScheduleGeneration,
  ): void {
    for (const request of this.requests.values()) {
      if (request.generation.id === generationId) {
        request.generation = change(request.generation);
      }
    }
  }
}

function keyOf(organizationId: string, key: IdempotencyKey): string {
  return JSON.stringify([organizationId, key.value]);
}
