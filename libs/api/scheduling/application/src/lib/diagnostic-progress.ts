import { DiagnosticNotFoundError } from './get-diagnostic';
import type { Clock } from '@trame/platform/clock';
import type { DiagnosticProgressV1 } from '@trame/shared/contracts';

export interface ProgressQuery {
  organizationId: string;
  runId: string;
  after?: string;
}
export interface ProgressSnapshot {
  finishedAt?: Temporal.Instant;
  cursorKnown: boolean;
  events: DiagnosticProgressV1[];
}
export interface DiagnosticProgress {
  read(query: ProgressQuery): Promise<ProgressSnapshot | undefined>;
  purgeFinishedBefore(instant: Temporal.Instant): Promise<number>;
}
export class ProgressExpiredError extends Error {
  constructor() {
    super('Historique expiré. Le résultat reste consultable.');
  }
}
export class InvalidProgressCursorError extends Error {
  constructor() {
    super('Identifiant de reprise invalide.');
  }
}
export class ReadDiagnosticProgress {
  constructor(
    private readonly progress: DiagnosticProgress,
    private readonly clock: Clock,
  ) {}
  async execute(query: ProgressQuery): Promise<ProgressSnapshot> {
    const snapshot = await this.progress.read(query);
    if (snapshot === undefined) throw new DiagnosticNotFoundError();
    if (
      snapshot.finishedAt !== undefined &&
      Temporal.Instant.compare(snapshot.finishedAt.add({ hours: 1 }), this.clock.now()) <= 0
    )
      throw new ProgressExpiredError();
    if (!snapshot.cursorKnown) throw new InvalidProgressCursorError();
    return snapshot;
  }
}
export class PruneDiagnosticProgress {
  constructor(
    private readonly progress: DiagnosticProgress,
    private readonly clock: Clock,
  ) {}
  async execute(): Promise<number> {
    return this.progress.purgeFinishedBefore(this.clock.now().subtract({ hours: 1 }));
  }
}
