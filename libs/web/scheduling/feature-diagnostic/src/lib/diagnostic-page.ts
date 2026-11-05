import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DiagnosticState } from '@trame/web/scheduling/data-access';

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
@Component({
  selector: 'tr-diagnostic-page',
  templateUrl: './diagnostic-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagnosticPage {
  protected readonly diagnostic = inject(DiagnosticState);
  protected readonly statusLabel = computed(() => statusLabels[this.diagnostic.phase()]);
  protected readonly busy = computed(() =>
    ['creating', 'queued', 'running'].includes(this.diagnostic.phase()),
  );
  protected readonly result = computed(() => this.diagnostic.run()?.outcome?.result);
  protected readonly resultLabel = computed(() => {
    const result = this.result();
    return result === undefined ? '' : resultLabels[result.status];
  });
  protected readonly assignments = computed(
    () =>
      this.result()?.solution?.assignment.map((post, index) => ({
        task: String.fromCharCode(65 + index),
        post: post + 1,
      })) ?? [],
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
