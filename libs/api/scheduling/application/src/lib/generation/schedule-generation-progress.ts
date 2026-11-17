import type { ScheduleGenerationProgressV1 } from '@trame/shared/contracts';
import { InvalidProgressCursorError } from '../diagnostic-progress';
import { ScheduleGenerationNotFoundError } from './generation.errors';

export interface ScheduleGenerationProgressQuery {
  organizationId: string;
  generationId: string;
  /** Identifiant du dernier événement reçu (`Last-Event-ID`). */
  after?: string;
}

export interface ScheduleGenerationProgressSnapshot {
  finishedAt?: Temporal.Instant;
  cursorKnown: boolean;
  events: ScheduleGenerationProgressV1[];
}

/**
 * Trois événements au plus par génération : ils sont gardés avec elle, sans purge ni expiration,
 * contrairement au diagnostic.
 */
export interface ScheduleGenerationProgress {
  /** `undefined` : la génération n'existe pas dans cette organisation. */
  read(
    query: ScheduleGenerationProgressQuery,
  ): Promise<ScheduleGenerationProgressSnapshot | undefined>;
}

export class ReadScheduleGenerationProgress {
  constructor(private readonly progress: ScheduleGenerationProgress) {}

  async execute(
    query: ScheduleGenerationProgressQuery,
  ): Promise<ScheduleGenerationProgressSnapshot> {
    const snapshot = await this.progress.read(query);
    if (snapshot === undefined) {
      throw new ScheduleGenerationNotFoundError();
    }
    if (!snapshot.cursorKnown) {
      throw new InvalidProgressCursorError();
    }
    return snapshot;
  }
}
