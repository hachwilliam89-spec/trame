import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { PlanningView } from './planning-view';

/**
 * Couverture du site, séparée des affectations : places pourvues, manques et détail par jour.
 * Le jour vérifié suit d'abord le premier manque, puis le choix du manager.
 */
@Component({
  selector: 'tr-week-coverage',
  templateUrl: './week-coverage.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeekCoverage {
  readonly view = input.required<PlanningView>();
  /** Le manager veut voir l'équipe de ce jour (date ISO). */
  readonly showDay = output<string>();

  protected readonly checkedDate = linkedSignal(() => {
    const view = this.view();
    return view.coverage.gaps[0]?.date ?? view.coverageByDay[0]?.date ?? '';
  });
  protected readonly checkedDay = computed(() =>
    this.view().coverageByDay.find((day) => day.date === this.checkedDate()),
  );
}
