import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthenticationRequired, WebSession } from '@trame/web/auth/data-access';
import {
  canManagePlanning,
  PlanningHttpError,
  PlanningState,
  readPlanningAddress,
} from '@trame/web/scheduling/data-access';
import { mondayOfDay } from './calendar';

@Component({
  selector: 'tr-planning-week-picker',
  templateUrl: './planning-week-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningWeekPicker {
  private readonly session = inject(WebSession);
  private readonly planning = inject(PlanningState);
  private readonly router = inject(Router);

  protected readonly canOpenPlanning = computed(() => canManagePlanning(this.session.identity()));
  protected readonly sites = resource({
    params: () => (this.canOpenPlanning() ? this.session.identity() : undefined),
    loader: ({ abortSignal }) => this.loadSites(abortSignal),
  });
  protected readonly siteId = linkedSignal(() => {
    if (!this.sites.hasValue()) return '';
    const sites = this.sites.value();
    return sites.length === 1 ? (sites[0]?.id ?? '') : '';
  });
  protected readonly day = signal('');

  protected open(event: Event): void {
    event.preventDefault();
    const day = this.day();
    if (day === '') return;

    const address = readPlanningAddress(this.siteId(), mondayOfDay(day));
    if (address === undefined) return;

    void this.router.navigate(['/planning'], {
      queryParams: { site: address.siteId, semaine: address.weekStartsOn },
    });
  }

  private async loadSites(signal: AbortSignal) {
    try {
      return await this.planning.listSites(signal);
    } catch (error) {
      if (
        !signal.aborted &&
        (error instanceof AuthenticationRequired ||
          (error instanceof PlanningHttpError && error.status === 401))
      ) {
        this.session.expire();
      }
      throw error;
    }
  }
}
