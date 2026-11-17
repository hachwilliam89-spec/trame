import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { PlanningState, readPlanningAddress } from '@trame/web/scheduling/data-access';
import { isoWeekNumber, weekRangeLabel } from './calendar';
import { attemptMessage } from './planning-status';
import { planningView } from './planning-view';
import { TeamGrid } from './team-grid';
import { WeekCoverage } from './week-coverage';

/**
 * Page Planning : `/planning?site=<uuid>&semaine=<lundi>`. Le dernier essai porte le message ;
 * le dernier planning exploitable porte la couverture et la grille (maquette validée).
 */
@Component({
  selector: 'tr-planning-page',
  imports: [TeamGrid, WeekCoverage],
  templateUrl: './planning-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningPage {
  protected readonly planning = inject(PlanningState);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly address = computed(() => {
    const query = this.query();
    return readPlanningAddress(query?.get('site') ?? null, query?.get('semaine') ?? null);
  });
  protected readonly heading = computed(() => {
    const address = this.address();
    const catalog = this.planning.catalog();
    if (address === undefined || catalog === undefined) return undefined;
    return {
      siteName: catalog.site.name,
      weekNumber: isoWeekNumber(address.weekStartsOn),
      rangeLabel: weekRangeLabel(address.weekStartsOn),
    };
  });
  protected readonly view = computed(() => {
    const schedule = this.planning.latestSchedule();
    const catalog = this.planning.catalog();
    return schedule === null || catalog === undefined ? undefined : planningView(schedule, catalog);
  });
  protected readonly message = computed(() =>
    attemptMessage(
      this.planning.latestAttempt(),
      this.planning.request(),
      this.planning.latestSchedule() !== null,
    ),
  );
  protected readonly selection = signal('week');
  protected readonly rulesOpen = signal(false);

  constructor() {
    // Pont vers la façade : chaque nouvelle adresse ouvre sa semaine (lecture seule, aucun POST).
    effect(() => {
      const address = this.address();
      if (address === undefined) return;
      untracked(() => void this.planning.open(address.siteId, address.weekStartsOn));
    });
  }

  protected act(): void {
    const action = this.message().action;
    if (action === 'generate') void this.planning.generate();
    if (action === 'resume') void this.planning.resume();
  }

  protected reload(): void {
    const address = this.address();
    if (address !== undefined) void this.planning.open(address.siteId, address.weekStartsOn);
  }

  protected showDay(date: string): void {
    this.selection.set(date);
  }
}
