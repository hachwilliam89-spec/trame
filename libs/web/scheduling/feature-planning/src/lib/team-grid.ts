import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import type { DisplayedDay, PlanningView } from './planning-view';
import type { TeamCell, TeamRow } from './team-view';

/** Sous 560 px, la vue Jour remplace la semaine complète (maquette validée). */
const NARROW_SCREEN = '(max-width: 560px)';
const WEEK = 'week';

interface SelectedCell {
  employeeId: string;
  date: string;
  shiftId: string;
}

/**
 * Grille de l'équipe : vues Semaine, Jour et Employé. La vue choisie est partagée avec la
 * couverture, qui peut ouvrir l'équipe d'un jour manquant.
 */
@Component({
  selector: 'tr-team-grid',
  templateUrl: './team-grid.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Échap referme la semaine d'un salarié, où que soit le focus dans la grille.
  host: { '(keydown.escape)': 'closeEmployee()' },
})
export class TeamGrid {
  readonly view = input.required<PlanningView>();
  /** `week`, ou la date ISO du jour affiché. */
  readonly selection = model<string>(WEEK);

  private readonly injector = inject(Injector);
  private readonly narrow = signal(false);
  private readonly selectedCell = signal<SelectedCell | undefined>(undefined);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private employeeTrigger?: HTMLElement;

  protected readonly openEmployeeId = signal<string | undefined>(undefined);
  protected readonly canShowWeek = computed(() => !this.narrow());
  /** La vue réellement affichée : un jour sur écran étroit, et toujours un jour qui existe. */
  protected readonly shownSelection = computed(() => {
    const days = this.view().days;
    const selection = this.selection();
    if (days.some((day) => day.date === selection)) return selection;
    return this.narrow() ? (days[0]?.date ?? WEEK) : WEEK;
  });
  protected readonly visibleDays = computed<{ day: DisplayedDay; index: number }[]>(() => {
    const selection = this.shownSelection();
    const days = this.view().days.map((day, index) => ({ day, index }));
    return selection === WEEK ? days : days.filter((entry) => entry.day.date === selection);
  });
  protected readonly columnCount = computed(() => this.visibleDays().length + 2);
  protected readonly cellDetail = computed(() => {
    const selected = this.selectedCell();
    if (selected === undefined) return undefined;
    const row = this.view().team.find((candidate) => candidate.employeeId === selected.employeeId);
    const day = row?.week.find((entry) => entry.date === selected.date);
    return day?.cells.find((cell) => cell.shiftId === selected.shiftId)?.detail;
  });

  constructor() {
    this.followScreenWidth();
  }

  protected choose(selection: string): void {
    this.selection.set(selection);
    this.selectedCell.set(undefined);
  }

  protected inspect(row: TeamRow, date: string, cell: TeamCell): void {
    this.selectedCell.set({ employeeId: row.employeeId, date, shiftId: cell.shiftId });
  }

  /** Ni affectation ni absence ce jour-là. */
  protected isUnplanned(row: TeamRow, dayIndex: number): boolean {
    const cells = row.cells[dayIndex] ?? [];
    const absences = row.absences[dayIndex] ?? [];
    return cells.length === 0 && absences.length === 0;
  }

  protected isInspected(row: TeamRow, cell: TeamCell): boolean {
    const selected = this.selectedCell();
    return selected?.employeeId === row.employeeId && selected.shiftId === cell.shiftId;
  }

  protected cellLabel(row: TeamRow, day: DisplayedDay, cell: TeamCell): string {
    return `${row.name}, ${day.name} ${day.dayOfMonth}, ${cell.shiftLabel}, ${cell.hours}, ${cell.positionName}`;
  }

  protected toggleEmployee(row: TeamRow, trigger: EventTarget | null): void {
    if (this.openEmployeeId() === row.employeeId) {
      this.closeEmployee();
      return;
    }
    this.employeeTrigger = trigger instanceof HTMLElement ? trigger : undefined;
    this.openEmployeeId.set(row.employeeId);
    afterNextRender(() => this.closeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeEmployee(): void {
    if (this.openEmployeeId() === undefined) return;
    this.openEmployeeId.set(undefined);
    this.employeeTrigger?.focus();
    this.employeeTrigger = undefined;
  }

  /** Pont vers `matchMedia`, une API impérative : écouteur retiré à la destruction. */
  private followScreenWidth(): void {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia(NARROW_SCREEN);
    this.narrow.set(query.matches);
    const update = (event: MediaQueryListEvent) => this.narrow.set(event.matches);
    query.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
  }
}
