import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Une tâche fictive et le poste que le moteur lui a attribué. */
export interface WovenAssignment {
  readonly task: string;
  readonly post: number;
}

/** Centre vertical de chaque ligne du dessin, dans le repère du `viewBox`. */
const ROW_CENTERS = [27, 75, 123];
const KNOT_HALF_HEIGHT = 17;
/** Décalage qui centre verticalement un libellé de 13 px dans son nœud. */
const LABEL_BASELINE_OFFSET = 5;
/** Bord droit des tâches et bord gauche des postes : les extrémités de chaque fil. */
const THREAD_START_X = 100;
const THREAD_END_X = 260;
const THREAD_MIDDLE_X = 180;

/**
 * Résultat du diagnostic dessiné comme un tissage : un fil relie chaque tâche au poste retenu.
 * Le dessin ne montre que les affectations reçues, sans animation ni valeur inventée.
 * Il est masqué aux lecteurs d'écran : la page leur donne la même affectation en tableau.
 */
@Component({
  selector: 'tr-assignment-weave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 360 150" aria-hidden="true" focusable="false">
      @for (thread of threads(); track thread.task) {
        <path class="thread" [attr.d]="thread.path" />
      }
      @for (row of rows(); track row.task) {
        <rect class="knot task" x="0" [attr.y]="row.top" width="100" height="34" />
        <text class="label on-task" x="50" [attr.y]="row.baseline">Tâche {{ row.task }}</text>
        <rect class="knot" x="260" [attr.y]="row.top" width="100" height="34" />
        <text class="label" x="310" [attr.y]="row.baseline">Poste {{ row.post }}</text>
      }
    </svg>
  `,
})
export class AssignmentWeave {
  readonly assignments = input.required<readonly WovenAssignment[]>();

  /** Une ligne par tâche, face au poste de même rang. */
  protected readonly rows = computed(() =>
    this.assignments().map((assignment, index) => ({
      task: assignment.task,
      post: index + 1,
      top: rowCenter(index) - KNOT_HALF_HEIGHT,
      baseline: rowCenter(index) + LABEL_BASELINE_OFFSET,
    })),
  );

  protected readonly threads = computed(() =>
    this.assignments().map((assignment, index) => ({
      task: assignment.task,
      path: threadPath(rowCenter(index), rowCenter(assignment.post - 1)),
    })),
  );
}

function rowCenter(index: number): number {
  return ROW_CENTERS[index] ?? 0;
}

/** Courbe qui part du bord d'une tâche et rejoint le bord de son poste. */
function threadPath(taskY: number, postY: number): string {
  return `M${THREAD_START_X} ${taskY} C ${THREAD_MIDDLE_X} ${taskY}, ${THREAD_MIDDLE_X} ${postY}, ${THREAD_END_X} ${postY}`;
}
