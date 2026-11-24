import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import type { PlanningRequest } from '@trame/web/scheduling/data-access';
import { attemptTimeLabel } from './calendar';

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
    case 'reading-result':
      return message('neutral', 'Récupération du résultat…' + kept);
    case 'lost':
      return message(
        'warning',
        'Le lancement n’a pas pu être confirmé. Réessayez : le calcul ne sera pas lancé deux fois.' +
          kept,
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
    return failure(attempt, 'error', 'Le calcul n’a pas pu aboutir.' + kept);
  }
  switch (attempt.outcome?.result.status) {
    case 'OPTIMAL':
    case 'FEASIBLE':
      return message('neutral', 'Planning proposé.', 'generate', 'Recalculer');
    case 'INFEASIBLE':
      return failure(
        attempt,
        'warning',
        'Aucun planning ne respecte les règles pour cette semaine.' + kept,
      );
    case 'UNKNOWN':
      return failure(attempt, 'warning', 'Délai atteint sans solution.' + kept);
    case 'CANCELLED':
      return failure(attempt, 'warning', 'Le calcul a été annulé.' + kept);
    default:
      return failure(attempt, 'error', 'Le résultat du calcul est indisponible.' + kept);
  }
}

/**
 * Un calcul sans planning, daté à l'heure du site : il reste visible, même quand le planning
 * précédent est affiché avec ses propres chiffres.
 */
function failure(
  attempt: ScheduleGenerationV1,
  tone: AttemptMessage['tone'],
  text: string,
): AttemptMessage {
  const when = attemptTimeLabel(attempt.finishedAt ?? attempt.createdAt, attempt.problem.timeZone);
  const sentence = text.charAt(0).toLowerCase() + text.slice(1);
  return message(tone, `Calcul du ${when} : ${sentence}`, 'generate', RELAUNCH);
}

function message(
  tone: AttemptMessage['tone'],
  text: string,
  action?: AttemptMessage['action'],
  actionLabel?: string,
): AttemptMessage {
  return { tone, text, action, actionLabel };
}
