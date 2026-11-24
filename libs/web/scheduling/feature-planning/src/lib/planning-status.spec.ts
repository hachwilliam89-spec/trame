import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import { attemptMessage } from './planning-status';

// Mardi 24 novembre 2026 : demandé à 20 h 04, terminé à 20 h 05, heure de Paris.
const CREATED_AT = '2026-11-24T19:04:40.000Z';
const FINISHED_AT = '2026-11-24T19:05:22.665Z';

function attempt(
  status: ScheduleGenerationV1['status'],
  result?: string,
  finishedAt: string | null = FINISHED_AT,
): ScheduleGenerationV1 {
  const outcome = result === undefined ? undefined : { result: { status: result } };
  return {
    id: 'A',
    status,
    outcome,
    problem: { timeZone: 'Europe/Paris' },
    createdAt: CREATED_AT,
    finishedAt: finishedAt ?? undefined,
  } as unknown as ScheduleGenerationV1;
}

describe('message sur le dernier calcul', () => {
  it('propose de générer quand la semaine n’a encore aucun calcul', () => {
    expect(attemptMessage(null, 'idle', false)).toEqual({
      tone: 'neutral',
      text: 'Aucun planning n’a encore été calculé pour cette semaine.',
      action: 'generate',
      actionLabel: 'Générer le planning',
    });
  });

  it('suit le calcul en cours sans action possible', () => {
    expect(attemptMessage(null, 'sending', false)).toMatchObject({
      text: 'Calcul demandé…',
      action: undefined,
    });
    expect(attemptMessage(attempt('QUEUED'), 'following', false)).toMatchObject({
      text: 'Calcul demandé…',
    });
    expect(attemptMessage(attempt('RUNNING'), 'following', true)).toMatchObject({
      text: 'Calcul en cours… Le planning affiché reste celui du calcul précédent.',
      action: undefined,
    });
  });

  it('dit qu’aucun planning ne respecte les règles, sans en proposer', () => {
    expect(attemptMessage(attempt('SUCCEEDED', 'INFEASIBLE'), 'idle', false)).toMatchObject({
      tone: 'warning',
      text: 'Calcul du mardi 24 novembre à 20 h 05 : aucun planning ne respecte les règles pour cette semaine.',
      action: 'generate',
      actionLabel: 'Relancer le calcul',
    });
  });

  it('propose de relancer quand le délai est atteint, en gardant le planning précédent', () => {
    expect(attemptMessage(attempt('SUCCEEDED', 'UNKNOWN'), 'idle', true)).toMatchObject({
      tone: 'warning',
      text: 'Calcul du mardi 24 novembre à 20 h 05 : délai atteint sans solution. Le planning affiché reste celui du calcul précédent.',
      action: 'generate',
      actionLabel: 'Relancer le calcul',
    });
  });

  it('BDD : date l’échec du dernier calcul quand le planning précédent reste affiché', () => {
    expect(attemptMessage(attempt('SUCCEEDED', 'CANCELLED'), 'idle', true)).toMatchObject({
      tone: 'warning',
      text: 'Calcul du mardi 24 novembre à 20 h 05 : le calcul a été annulé. Le planning affiché reste celui du calcul précédent.',
    });
  });

  it('distingue la réponse perdue, à retenter, du suivi coupé, à reprendre', () => {
    expect(attemptMessage(null, 'lost', false)).toMatchObject({
      action: 'generate',
      actionLabel: 'Réessayer',
    });
    expect(attemptMessage(attempt('RUNNING'), 'interrupted', false)).toMatchObject({
      action: 'resume',
      actionLabel: 'Reprendre le suivi',
    });
  });

  it('ne répète rien quand le dernier calcul a donné le planning affiché', () => {
    expect(attemptMessage(attempt('SUCCEEDED', 'OPTIMAL'), 'idle', true)).toMatchObject({
      tone: 'neutral',
      text: 'Planning proposé.',
      action: 'generate',
      actionLabel: 'Recalculer',
    });
  });

  it('signale un échec de traitement et l’API qui refuse la semaine', () => {
    expect(attemptMessage(attempt('FAILED', undefined, null), 'idle', false)).toMatchObject({
      tone: 'error',
      text: 'Calcul du mardi 24 novembre à 20 h 04 : le calcul n’a pas pu aboutir.',
      action: 'generate',
    });
    expect(attemptMessage(null, 'rejected', false)).toMatchObject({
      tone: 'error',
      text: 'Cette semaine ne peut pas être calculée : aucun besoin, ou une équipe trop grande.',
    });
  });
});
