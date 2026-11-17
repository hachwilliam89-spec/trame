import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import type { PlanningRequest } from '@trame/web/scheduling/data-access';

/** Ce que l'écran dit du dernier calcul, et l'action qu'il propose. */
export interface AttemptMessage {
  tone: 'neutral' | 'warning' | 'error';
  text: string;
  action: 'generate' | 'resume' | undefined;
  actionLabel: string | undefined;
}

const KEPT = ' Le planning affiché reste celui du calcul précédent.';
const RELAUNCH = 'Relancer le calcul';

export function attemptMessage(
  attempt: ScheduleGenerationV1 | null,
  request: PlanningRequest,
  hasSchedule: boolean,
): AttemptMessage {
  const kept = hasSchedule ? KEPT : '';
  switch (request) {
    case 'sending':
      return message('neutral', 'Calcul demandé…');
    case 'lost':
      return message(
        'warning',
        'La demande n’a pas reçu de réponse. Réessayez : le calcul ne sera pas lancé deux fois.',
        'generate',
        'Réessayer',
      );
    case 'interrupted':
      return message(
        'warning',
        'Le suivi du calcul s’est interrompu.' + kept,
        'resume',
        'Reprendre le suivi',
      );
    case 'rejected':
      return message(
        'error',
        'Cette semaine ne peut pas être calculée : aucun besoin, ou une équipe trop grande.',
      );
    default:
      return attempt === null
        ? message(
            'neutral',
            'Aucun planning n’a encore été calculé pour cette semaine.',
            'generate',
            'Générer le planning',
          )
        : attemptOutcome(attempt, kept);
  }
}

function attemptOutcome(attempt: ScheduleGenerationV1, kept: string): AttemptMessage {
  if (attempt.status === 'QUEUED') return message('neutral', 'Calcul demandé…');
  if (attempt.status === 'RUNNING') return message('neutral', 'Calcul en cours…' + kept);
  if (attempt.status === 'FAILED') {
    return message('error', 'Le calcul n’a pas pu aboutir.' + kept, 'generate', RELAUNCH);
  }
  switch (attempt.outcome?.result.status) {
    case 'OPTIMAL':
    case 'FEASIBLE':
      return message('neutral', 'Planning proposé.', 'generate', 'Recalculer');
    case 'INFEASIBLE':
      return message(
        'warning',
        'Aucun planning ne respecte les règles pour cette semaine.' + kept,
        'generate',
        RELAUNCH,
      );
    case 'UNKNOWN':
      return message('warning', 'Délai atteint sans solution.' + kept, 'generate', RELAUNCH);
    default:
      return message('warning', 'Le calcul a été annulé.' + kept, 'generate', RELAUNCH);
  }
}

function message(
  tone: AttemptMessage['tone'],
  text: string,
  action?: AttemptMessage['action'],
  actionLabel?: string,
): AttemptMessage {
  return { tone, text, action, actionLabel };
}
