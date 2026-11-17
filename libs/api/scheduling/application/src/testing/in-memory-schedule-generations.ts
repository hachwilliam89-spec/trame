import {
  hasSchedule,
  progressStateOf,
  type ScheduleGeneration,
} from '@trame/api/scheduling/domain';
import type { IdempotencyKey } from '@trame/platform/idempotency';
import type {
  ScheduleGenerationProgressV1,
  ScheduleOutcomeV1,
  ScheduleReportedV1,
} from '@trame/shared/contracts';
import {
  type ScheduleReports,
  UnmatchedScheduleReportError,
} from '../lib/generation/receive-schedule-report';
import type {
  ScheduleGenerationProgress,
  ScheduleGenerationProgressQuery,
  ScheduleGenerationProgressSnapshot,
} from '../lib/generation/schedule-generation-progress';
import type {
  ScheduleGenerationRequest,
  ScheduleGenerations,
  WeekScheduleGenerations,
} from '../lib/generation/schedule-generations';

export class InMemoryScheduleGenerations
  implements ScheduleGenerations, ScheduleReports, ScheduleGenerationProgress
{
  private readonly requests = new Map<string, ScheduleGenerationRequest>();
  private readonly receipts = new Set<string>();
  private readonly events: ScheduleGenerationProgressV1[] = [];

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

  async latestOfWeek(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<WeekScheduleGenerations> {
    const ofWeek = this.ofWeek(organizationId, siteId, weekStartsOn);
    return { latestAttempt: ofWeek.at(-1), latestSchedule: ofWeek.filter(hasSchedule).at(-1) };
  }

  async accept(
    message: ScheduleReportedV1,
    decide: (generation: ScheduleGeneration) => ScheduleGeneration | undefined,
  ): Promise<void> {
    const request = [...this.requests.values()].find(
      (candidate) =>
        candidate.message.id === message.payload.requestId &&
        candidate.message.organizationId === message.organizationId &&
        candidate.generation.id === message.payload.generationId,
    );
    if (request === undefined) {
      throw new UnmatchedScheduleReportError();
    }
    if (this.receipts.has(message.id)) {
      return;
    }
    // Comme en base : la décision échoue avant l'écriture du reçu et de la génération.
    const updated = decide(request.generation);
    this.receipts.add(message.id);
    if (updated === undefined) {
      return;
    }
    request.generation = updated;
    const state = progressStateOf(updated);
    if (state !== undefined) {
      const sequence = this.eventsOf(updated.id).length + 1;
      this.events.push({
        id: message.id,
        generationId: updated.id,
        sequence,
        occurredAt: message.occurredAt,
        ...state,
      });
    }
  }

  async read(
    query: ScheduleGenerationProgressQuery,
  ): Promise<ScheduleGenerationProgressSnapshot | undefined> {
    const generation = await this.findById(query.organizationId, query.generationId);
    if (generation === undefined) {
      return undefined;
    }
    const events = this.eventsOf(generation.id);
    const cursor = events.find((event) => event.id === query.after);
    const cursorKnown = query.after === undefined || cursor !== undefined;
    return {
      cursorKnown,
      finishedAt: generation.finishedAt,
      events: events.filter((event) => event.sequence > (cursor?.sequence ?? 0)),
    };
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

  private eventsOf(generationId: string): ScheduleGenerationProgressV1[] {
    return this.events.filter((event) => event.generationId === generationId);
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
