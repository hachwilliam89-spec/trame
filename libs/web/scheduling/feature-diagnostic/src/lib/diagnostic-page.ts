import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { DiagnosticRunV1 } from '@trame/shared/contracts/scheduling';
import { DiagnosticState } from '@trame/web/scheduling/data-access';
import { AssignmentWeave } from './assignment-weave';

type DiagnosticOutcome = NonNullable<DiagnosticRunV1['outcome']>;

const statusLabels = {
  ready: 'Prêt à lancer',
  creating: 'Enregistrement',
  queued: 'En attente',
  running: 'En cours',
  disconnected: 'Suivi interrompu',
  result: 'Terminé',
  failed: 'Échec du calcul',
  expired: 'Session expirée',
  forbidden: 'Accès refusé',
  missing: 'Introuvable',
  unavailable: 'Indisponible',
};
const resultLabels = {
  OPTIMAL: 'Les trois tâches ont été affectées.',
  FEASIBLE: 'Une affectation a été trouvée.',
  INFEASIBLE: 'Aucune affectation possible pour ce test.',
  UNKNOWN: 'Le calcul n’a pas permis de conclure.',
  CANCELLED: 'Le calcul a été annulé.',
};
/** L'issue du solveur, dite en clair. Le code brut reste dans les détails du calcul. */
const issueLabels = {
  OPTIMAL: 'Optimale',
  FEASIBLE: 'Réalisable',
  INFEASIBLE: 'Aucune solution',
  UNKNOWN: 'Non conclue',
  CANCELLED: 'Annulée',
};
const MILLISECONDS_PER_SECOND = 1000;
const secondsFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

@Component({
  selector: 'tr-diagnostic-page',
  imports: [AssignmentWeave],
  templateUrl: './diagnostic-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagnosticPage {
  protected readonly diagnostic = inject(DiagnosticState);
  protected readonly statusLabel = computed(() => statusLabels[this.diagnostic.phase()]);
  protected readonly busy = computed(() =>
    ['creating', 'queued', 'running'].includes(this.diagnostic.phase()),
  );
  protected readonly outcome = computed(() => this.diagnostic.run()?.outcome);
  protected readonly result = computed(() => this.outcome()?.result);
  protected readonly resultLabel = computed(() => {
    const result = this.result();
    return result === undefined ? '' : resultLabels[result.status];
  });
  protected readonly issueLabel = computed(() => {
    const result = this.result();
    return result === undefined ? '' : issueLabels[result.status];
  });
  protected readonly assignments = computed(
    () =>
      this.result()?.solution?.assignment.map((post, index) => ({
        task: taskLetter(index),
        post: post + 1,
      })) ?? [],
  );
  /** Durée réelle, de l'enregistrement de la demande à la fin du calcul. */
  protected readonly durationLabel = computed(() => durationLabelOf(this.diagnostic.run()));
  /** Les coûts du problème soumis au moteur, avec les cases de l'affectation retenue. */
  protected readonly costRows = computed(() => costRowsOf(this.outcome()));
  protected readonly costPosts = computed(() =>
    (this.costRows()[0]?.cells ?? []).map((cell) => cell.post),
  );
  protected readonly complete = computed(() =>
    ['result', 'failed'].includes(this.diagnostic.phase()),
  );
  protected readonly resumable = computed(() =>
    ['disconnected', 'unavailable'].includes(this.diagnostic.phase()),
  );
  protected readonly launchLabel = computed(() =>
    this.complete() ? 'Lancer un nouveau test' : 'Tester le moteur',
  );
  protected launch(): void {
    void this.diagnostic.start();
  }
  protected resume(): void {
    void this.diagnostic.resume();
  }
}

/** Tâche A, B, C : le rang de la tâche dans le problème, en lettre. */
function taskLetter(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

/** `undefined` tant que la fin du calcul n'est pas connue : aucune durée n'est inventée. */
function durationLabelOf(run: DiagnosticRunV1 | undefined): string | undefined {
  if (run?.finishedAt === undefined) {
    return undefined;
  }
  const milliseconds = Date.parse(run.finishedAt) - Date.parse(run.createdAt);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return undefined;
  }
  return `${secondsFormat.format(milliseconds / MILLISECONDS_PER_SECOND)} s`;
}

function costRowsOf(outcome: DiagnosticOutcome | undefined) {
  if (outcome === undefined) {
    return [];
  }
  const assignment = outcome.result.solution?.assignment;
  return outcome.problem.costs.map((costs, taskIndex) => ({
    task: taskLetter(taskIndex),
    cells: costs.map((cost, postIndex) => ({
      post: postIndex + 1,
      cost,
      chosen: assignment?.[taskIndex] === postIndex,
    })),
  }));
}
