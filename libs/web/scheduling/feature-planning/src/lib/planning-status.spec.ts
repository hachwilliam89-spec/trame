import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import { attemptMessage } from './planning-status';

function attempt(status: ScheduleGenerationV1['status'], result?: string): ScheduleGenerationV1 {
  const outcome = result === undefined ? undefined : { result: { status: result } };
  return { id: 'A', status, outcome } as unknown as ScheduleGenerationV1;
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
      text: 'Aucun planning ne respecte les règles pour cette semaine.',
      action: 'generate',
      actionLabel: 'Relancer le calcul',
    });
  });

  it('propose de relancer quand le délai est atteint, en gardant le planning précédent', () => {
    expect(attemptMessage(attempt('SUCCEEDED', 'UNKNOWN'), 'idle', true)).toMatchObject({
      tone: 'warning',
      text: 'Délai atteint sans solution. Le planning affiché reste celui du calcul précédent.',
      action: 'generate',
      actionLabel: 'Relancer le calcul',
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
    expect(attemptMessage(attempt('FAILED'), 'idle', false)).toMatchObject({
      tone: 'error',
      action: 'generate',
    });
    expect(attemptMessage(null, 'rejected', false)).toMatchObject({
      tone: 'error',
      text: 'Cette semaine ne peut pas être calculée : aucun besoin, ou une équipe trop grande.',
    });
  });
});
