import { InvalidProgressCursorError } from '@trame/api/scheduling/application';
import type { Actor } from '@trame/platform/auth';
import type { Clock } from '@trame/platform/clock';
import { ProblemDetailsException } from '@trame/platform/problem-details';
import { z } from 'zod';

/** Expiration du jeton : un flux ne survit pas à l'autorisation qui l'a ouvert. */
export function streamDeadline(actor: Actor, clock: Clock): number {
  const deadline = actor.expiresAtEpochMilliseconds;
  if (
    deadline === undefined ||
    !Number.isSafeInteger(deadline) ||
    deadline <= clock.now().epochMilliseconds
  ) {
    throw new ProblemDetailsException(
      { status: 401, detail: 'Authentification requise.' },
      { headers: { 'WWW-Authenticate': 'Bearer' } },
    );
  }
  return deadline;
}

/** `Last-Event-ID` : l'identifiant du dernier événement reçu, ou rien. */
export function parseProgressCursor(value: unknown): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    throw new InvalidProgressCursorError();
  }
  return parsed.data;
}
