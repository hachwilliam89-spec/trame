import { signal } from '@angular/core';
import type { PositionV1, ShiftTemplateV1, SiteV1 } from '@trame/shared/contracts/organization';
import type {
  ScheduleGenerationProgressV1,
  ScheduleGenerationV1,
} from '@trame/shared/contracts/scheduling';
import type { EmployeeV1 } from '@trame/shared/contracts/staff';
import { AuthenticationRequired, type WebIdentity } from '@trame/web/auth/data-access';
import { PlanningHttpError, type PlanningGateway } from './planning-api';

/** Chargement de la semaine demandée. */
export type PlanningPhase =
  'idle' | 'loading' | 'ready' | 'forbidden' | 'missing' | 'expired' | 'unavailable';

/**
 * Commande du manager : `sending` pendant le lancement, `following` pendant le suivi. `lost` : la
 * réponse au lancement s'est perdue, à retenter avec la même clé. `interrupted` : le suivi s'est
 * coupé avant l'issue, à reprendre sans relancer. `rejected` : l'API refuse cette semaine.
 */
export type PlanningRequest =
  'idle' | 'sending' | 'following' | 'lost' | 'interrupted' | 'rejected';

/** Libellés du site : la génération ne porte que des identifiants (aucun nom n'est copié). */
export interface PlanningCatalog {
  site: SiteV1;
  positions: PositionV1[];
  shiftTemplates: ShiftTemplateV1[];
  employees: EmployeeV1[];
}

/** Clé d'idempotence d'un lancement dont la réponse n'est pas encore arrivée. */
interface PendingStart {
  siteId: string;
  weekStartsOn: string;
  key: string;
}

/**
 * Planning d'une semaine. `latestAttempt` porte le message sur le calcul en cours ou son issue ;
 * `latestSchedule`, le dernier planning exploitable, reste affiché quand un nouvel essai échoue.
 */
export class PlanningState {
  private readonly phaseState = signal<PlanningPhase>('idle');
  private readonly catalogState = signal<PlanningCatalog | undefined>(undefined);
  private readonly attemptState = signal<ScheduleGenerationV1 | null>(null);
  private readonly scheduleState = signal<ScheduleGenerationV1 | null>(null);
  private readonly requestState = signal<PlanningRequest>('idle');

  readonly phase = this.phaseState.asReadonly();
  readonly catalog = this.catalogState.asReadonly();
  readonly latestAttempt = this.attemptState.asReadonly();
  readonly latestSchedule = this.scheduleState.asReadonly();
  readonly request = this.requestState.asReadonly();

  private scope?: string;
  private canManage = false;
  private week?: { siteId: string; weekStartsOn: string };
  private pending?: PendingStart;
  private abort?: AbortController;

  constructor(
    private readonly api: PlanningGateway,
    private readonly keys: () => string,
  ) {}

  /**
   * Au changement de compte ou d'organisation : abandonne les requêtes et vide l'état. La semaine
   * demandée par l'adresse est rouverte pour le nouveau compte, s'il peut la lire.
   */
  async identify(identity: WebIdentity | undefined): Promise<void> {
    const scope = scopeOf(identity);
    const canManage = managesPlanning(identity);
    if (scope === this.scope && canManage === this.canManage) return;
    this.disconnect();
    this.scope = scope;
    this.canManage = canManage;
    this.pending = undefined;
    this.clear(identity !== undefined && !canManage ? 'forbidden' : 'idle');
    const week = this.week;
    if (canManage && week !== undefined) await this.open(week.siteId, week.weekStartsOn);
  }

  /** Ouvre la semaine ; avant que le compte soit connu, elle est seulement retenue. */
  async open(siteId: string, weekStartsOn: string): Promise<void> {
    this.week = { siteId, weekStartsOn };
    if (!this.canManage) return;
    const operation = this.begin();
    this.clear('loading');
    try {
      const [catalog, week] = await Promise.all([
        this.readCatalog(siteId, operation.signal),
        this.api.week(siteId, weekStartsOn, operation.signal),
      ]);
      if (!this.current(operation)) return;
      this.catalogState.set(catalog);
      this.attemptState.set(week.latestAttempt);
      this.scheduleState.set(week.latestSchedule);
      this.phaseState.set('ready');
      const attempt = week.latestAttempt;
      if (attempt !== null && !isFinished(attempt)) await this.follow(attempt.id, operation);
    } catch (error) {
      if (this.current(operation)) this.failReading(error);
    }
  }

  /** Lance un calcul ; sans effet tant que le calcul précédent n'a pas d'issue. */
  async generate(): Promise<void> {
    const week = this.week;
    if (week === undefined || this.phase() !== 'ready' || this.isBusy()) return;
    const attempt = this.latestAttempt();
    if (attempt !== null && !isFinished(attempt)) return;
    const pending = this.pendingFor(week.siteId, week.weekStartsOn);
    const operation = this.begin();
    this.requestState.set('sending');
    try {
      const generation = await this.api.start(week, pending.key, operation.signal);
      if (!this.current(operation)) return;
      this.pending = undefined;
      this.apply(generation);
      if (isFinished(generation)) this.requestState.set('idle');
      else await this.follow(generation.id, operation);
    } catch (error) {
      if (this.current(operation)) this.failStarting(error);
    }
  }

  /** Reprend le suivi coupé du dernier calcul, puis relit son état. */
  async resume(): Promise<void> {
    const attempt = this.latestAttempt();
    if (this.request() !== 'interrupted' || attempt === null) return;
    const operation = this.begin();
    try {
      await this.follow(attempt.id, operation);
    } catch (error) {
      if (this.current(operation)) this.failReading(error);
    }
  }

  /** Arrête le suivi en cours, par exemple à la déconnexion. */
  disconnect(): void {
    this.abort?.abort();
  }

  /** Suit le calcul jusqu'à la fin du flux, puis relit son état, que le flux ait abouti ou non. */
  private async follow(generationId: string, operation: AbortController): Promise<void> {
    this.requestState.set('following');
    try {
      await this.api.follow(
        generationId,
        (event) => this.receive(event, operation),
        operation.signal,
      );
    } catch (error) {
      if (error instanceof AuthenticationRequired) throw error;
    }
    if (!this.current(operation)) return;
    let generation: ScheduleGenerationV1;
    try {
      generation = await this.api.generation(generationId, operation.signal);
    } catch (error) {
      // Une coupure réseau garde l'écran ; un refus ou une session expirée remonte.
      if (error instanceof AuthenticationRequired || error instanceof PlanningHttpError)
        throw error;
      if (this.current(operation)) this.requestState.set('interrupted');
      return;
    }
    if (!this.current(operation)) return;
    this.apply(generation);
    this.requestState.set(isFinished(generation) ? 'idle' : 'interrupted');
  }

  private receive(event: ScheduleGenerationProgressV1, operation: AbortController): void {
    const attempt = this.attemptState();
    if (!this.current(operation) || attempt?.id !== event.generationId) return;
    this.attemptState.set({ ...attempt, status: event.status });
  }

  private apply(generation: ScheduleGenerationV1): void {
    this.attemptState.set(generation);
    if (hasSchedule(generation)) this.scheduleState.set(generation);
  }

  private async readCatalog(siteId: string, signal: AbortSignal): Promise<PlanningCatalog> {
    const [site, positions, shiftTemplates, employees] = await Promise.all([
      this.api.site(siteId, signal),
      this.api.positions(siteId, signal),
      this.api.shiftTemplates(siteId, signal),
      this.api.employees(siteId, signal),
    ]);
    return { site, positions, shiftTemplates, employees };
  }

  /** La même clé tant que la réponse au lancement de cette semaine n'est pas arrivée. */
  private pendingFor(siteId: string, weekStartsOn: string): PendingStart {
    const pending = this.pending;
    if (pending?.siteId === siteId && pending.weekStartsOn === weekStartsOn) return pending;
    this.pending = { siteId, weekStartsOn, key: this.keys() };
    return this.pending;
  }

  private isBusy(): boolean {
    const request = this.request();
    return request === 'sending' || request === 'following';
  }

  private failReading(error: unknown): void {
    this.clear(phaseOf(error));
  }

  private failStarting(error: unknown): void {
    if (error instanceof PlanningHttpError) {
      // L'API a répondu : la demande n'est pas à retenter avec cette clé.
      this.pending = undefined;
      if (error.status === 422) {
        this.requestState.set('rejected');
        return;
      }
    }
    const phase = phaseOf(error);
    if (phase === 'unavailable' && !(error instanceof PlanningHttpError)) {
      this.requestState.set('lost');
      return;
    }
    this.clear(phase);
  }

  private clear(phase: PlanningPhase): void {
    this.catalogState.set(undefined);
    this.attemptState.set(null);
    this.scheduleState.set(null);
    this.requestState.set('idle');
    this.phaseState.set(phase);
  }

  private begin(): AbortController {
    this.abort?.abort();
    this.abort = new AbortController();
    return this.abort;
  }

  private current(operation: AbortController): boolean {
    return this.abort === operation && !operation.signal.aborted;
  }
}

function isFinished(generation: ScheduleGenerationV1): boolean {
  return generation.status === 'SUCCEEDED' || generation.status === 'FAILED';
}

/** Un planning exploitable : issue `OPTIMAL` ou `FEASIBLE`, comme `latestSchedule` côté API. */
function hasSchedule(generation: ScheduleGenerationV1): boolean {
  const status = generation.outcome?.result.status;
  return status === 'OPTIMAL' || status === 'FEASIBLE';
}

function phaseOf(error: unknown): PlanningPhase {
  if (error instanceof AuthenticationRequired) return 'expired';
  if (!(error instanceof PlanningHttpError)) return 'unavailable';
  const phases: Record<number, PlanningPhase> = {
    401: 'expired',
    403: 'forbidden',
    404: 'missing',
  };
  return phases[error.status] ?? 'unavailable';
}

function scopeOf(identity: WebIdentity | undefined): string | undefined {
  if (identity === undefined) return undefined;
  return JSON.stringify([identity.organizationId, identity.subject]);
}

function managesPlanning(identity: WebIdentity | undefined): boolean {
  return identity?.roles.some((role) => role === 'admin' || role === 'manager') ?? false;
}
