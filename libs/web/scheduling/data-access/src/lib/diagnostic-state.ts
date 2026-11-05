import { signal } from '@angular/core';
import type { DiagnosticRunV1, DiagnosticProgressV1 } from '@trame/shared/contracts/scheduling';
import { AuthenticationRequired, type WebIdentity } from '@trame/web/auth/data-access';
import { DiagnosticHttpError, type DiagnosticGateway } from './diagnostic-api';
import { DiagnosticBookmarks, type DiagnosticBookmark } from './diagnostic-bookmark';
export type DiagnosticPhase =
  | 'ready'
  | 'creating'
  | 'queued'
  | 'running'
  | 'disconnected'
  | 'result'
  | 'failed'
  | 'expired'
  | 'forbidden'
  | 'missing'
  | 'unavailable';
export class DiagnosticState {
  readonly phase = signal<DiagnosticPhase>('ready');
  readonly run = signal<DiagnosticRunV1 | undefined>(undefined);
  readonly historyExpired = signal(false);
  private readonly bookmarks: DiagnosticBookmarks;
  private scope?: string;
  private bookmark?: DiagnosticBookmark;
  private abort?: AbortController;
  private canStart = false;
  constructor(
    private readonly api: DiagnosticGateway,
    storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly ids: () => string,
  ) {
    this.bookmarks = new DiagnosticBookmarks(storage);
  }

  async identify(identity: WebIdentity | undefined): Promise<void> {
    const scope = scopeOf(identity);
    const canStart = canManage(identity);
    if (scope === this.scope && canStart === this.canStart) return;
    this.abort?.abort();
    this.scope = scope;
    this.run.set(undefined);
    this.historyExpired.set(false);
    this.phase.set('ready');
    this.canStart = canStart;
    this.bookmark = scope === undefined ? undefined : this.bookmarks.read(scope);
    if (identity !== undefined && !this.canStart) {
      this.phase.set('forbidden');
      return;
    }
    if (this.bookmark !== undefined) await this.resume();
  }
  async start(): Promise<void> {
    if (!this.canStart) {
      this.phase.set('forbidden');
      return;
    }
    if (['creating', 'queued', 'running'].includes(this.phase())) return;
    if (this.bookmark === undefined || ['result', 'failed'].includes(this.phase())) {
      this.bookmark = { key: this.ids(), sequence: 0 };
      this.run.set(undefined);
      this.historyExpired.set(false);
      this.persist();
    }
    const operation = this.begin();
    this.phase.set('creating');
    try {
      const run = await this.api.start(this.bookmark.key, operation.signal);
      if (!this.current(operation)) return;
      this.bookmark.runId = run.id;
      this.persist();
      this.apply(run);
      await this.follow(operation);
    } catch (error) {
      if (this.current(operation)) this.fail(error);
    }
  }
  async resume(): Promise<void> {
    if (this.bookmark?.runId === undefined) {
      await this.start();
      return;
    }
    const operation = this.begin();
    this.phase.set('queued');
    try {
      const run = await this.api.get(this.bookmark.runId, operation.signal);
      if (!this.current(operation)) return;
      this.apply(run);
      if (!this.terminal()) await this.follow(operation);
    } catch (error) {
      if (this.current(operation)) this.fail(error);
    }
  }
  disconnect(): void {
    this.abort?.abort();
    if (!this.terminal() && this.bookmark !== undefined) this.phase.set('disconnected');
  }
  private async follow(operation: AbortController): Promise<void> {
    const runId = this.bookmark?.runId;
    if (runId === undefined || this.terminal()) return;
    try {
      await this.api.follow(
        runId,
        this.bookmark?.cursor,
        (event) => {
          if (this.current(operation)) this.receive(event);
        },
        operation.signal,
      );
    } catch (error) {
      if (!isExpiredHistory(error)) throw error;
      if (!this.current(operation)) return;
      this.historyExpired.set(true);
    }
    await this.refreshAfterStream(runId, operation);
  }
  private async refreshAfterStream(runId: string, operation: AbortController): Promise<void> {
    if (!this.current(operation)) return;
    if (!this.terminal()) {
      const run = await this.api.get(runId, operation.signal);
      if (!this.current(operation)) return;
      this.apply(run);
    }
    if (this.current(operation) && !this.terminal()) this.phase.set('disconnected');
  }

  private receive(event: DiagnosticProgressV1): void {
    const run = this.run();
    const bookmark = this.bookmark;
    if (run === undefined || bookmark === undefined || event.sequence <= bookmark.sequence) return;
    if (event.sequence !== bookmark.sequence + 1) throw new Error('Progression incomplète');
    const report = event.report;
    switch (report.kind) {
      case 'STARTED':
        this.apply({ ...run, status: 'RUNNING' });
        break;
      case 'RESULT':
        this.apply({ ...run, status: 'SUCCEEDED', outcome: report.outcome });
        break;
      case 'FAILED':
        this.apply({ ...run, status: 'FAILED', failure: report.code });
        break;
    }
    bookmark.cursor = event.id;
    bookmark.sequence = event.sequence;
    this.persist();
  }
  private apply(run: DiagnosticRunV1): void {
    this.run.set(run);
    const phases = {
      QUEUED: 'queued',
      RUNNING: 'running',
      SUCCEEDED: 'result',
      FAILED: 'failed',
    } as const;
    this.phase.set(phases[run.status]);
  }
  private fail(error: unknown): void {
    if (error instanceof AuthenticationRequired) {
      this.run.set(undefined);
      this.phase.set('expired');
      return;
    }
    const phases: Record<number, DiagnosticPhase> = {
      401: 'expired',
      403: 'forbidden',
      404: 'missing',
      400: 'unavailable',
      503: 'unavailable',
    };
    const phase =
      error instanceof DiagnosticHttpError
        ? (phases[error.status] ?? 'unavailable')
        : 'disconnected';
    if (['expired', 'forbidden', 'missing'].includes(phase)) this.run.set(undefined);
    this.phase.set(phase);
  }
  private terminal(): boolean {
    return ['result', 'failed'].includes(this.phase());
  }
  private begin(): AbortController {
    this.abort?.abort();
    this.abort = new AbortController();
    return this.abort;
  }
  private current(operation: AbortController): boolean {
    return this.abort === operation && !operation.signal.aborted;
  }
  private persist(): void {
    if (this.scope !== undefined && this.bookmark !== undefined)
      this.bookmarks.write(this.scope, this.bookmark);
  }
}

function scopeOf(identity: WebIdentity | undefined): string | undefined {
  if (identity === undefined) return undefined;
  return 'trame.diagnostic.' + JSON.stringify([identity.organizationId, identity.subject]);
}
function canManage(identity: WebIdentity | undefined): boolean {
  return identity?.roles.some((role) => ['admin', 'manager'].includes(role)) ?? false;
}
function isExpiredHistory(error: unknown): boolean {
  return error instanceof DiagnosticHttpError && error.status === 410;
}
