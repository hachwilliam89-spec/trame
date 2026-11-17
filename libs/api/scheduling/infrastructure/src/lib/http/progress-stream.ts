import { once } from 'node:events';
import type { Clock } from '@trame/platform/clock';
import type { Response } from 'express';

/** Un lot d'événements après le curseur, et la fin du traitement s'il est terminé. */
export interface ProgressBatch<Event extends { id: string }> {
  finishedAt?: Temporal.Instant;
  events: readonly Event[];
}

export interface ProgressStreamOptions<Event extends { id: string }> {
  response: Response;
  clock: Clock;
  /** Expiration du jeton : le flux se ferme alors, même pendant une lecture. */
  expiresAt: number;
  initial: ProgressBatch<Event>;
  read: (after: string | undefined) => Promise<ProgressBatch<Event>>;
  after?: string;
  /** Nom SSE des événements : `diagnostic` ou `schedule-generation`. */
  eventName: string;
  /** Le flux se termine après le premier événement final. */
  isFinal: (event: Event) => boolean;
  onError: (error: unknown) => void;
}

/**
 * Boucle SSE commune au diagnostic et à la génération : reprise par `Last-Event-ID`, maintien à
 * 20 s, fermeture à l'expiration du jeton. Un seul lot en mémoire ; la déconnexion annule aussi
 * l'attente d'un client lent.
 */
export async function serveProgressStream<Event extends { id: string }>(
  options: ProgressStreamOptions<Event>,
): Promise<void> {
  if (options.response.destroyed) return;
  const stop = new AbortController();
  const closed = () => stop.abort();
  const { response } = options;
  response.once('close', closed);
  response.once('error', closed);
  const clearTimers = scheduleConnectionLimits(options, stop);
  try {
    await sendProgress(options, stop.signal);
  } catch (error) {
    if (!stop.signal.aborted) options.onError(error);
  } finally {
    clearTimers();
    stop.abort();
    response.removeListener('close', closed);
    response.removeListener('error', closed);
    response.end();
  }
}

function authorized<Event extends { id: string }>(
  options: ProgressStreamOptions<Event>,
  signal: AbortSignal,
): boolean {
  return !signal.aborted && options.clock.now().epochMilliseconds < options.expiresAt;
}

function scheduleConnectionLimits<Event extends { id: string }>(
  options: ProgressStreamOptions<Event>,
  stop: AbortController,
): () => void {
  let deadline: ReturnType<typeof setTimeout>;
  const expire = () => {
    const remaining = options.expiresAt - options.clock.now().epochMilliseconds;
    if (remaining <= 0) {
      stop.abort();
      options.response.destroy();
      return;
    }
    deadline = setTimeout(expire, Math.min(remaining, 2_147_483_647));
  };
  expire();
  const keepalive = setInterval(() => {
    if (authorized(options, stop.signal) && !options.response.writableNeedDrain) {
      options.response.write(': keepalive\n\n');
    }
  }, 20_000);
  return () => {
    clearTimeout(deadline);
    clearInterval(keepalive);
  };
}

async function sendProgress<Event extends { id: string }>(
  options: ProgressStreamOptions<Event>,
  signal: AbortSignal,
): Promise<void> {
  let snapshot = options.initial;
  let after = options.after;
  while (authorized(options, signal)) {
    for (const event of snapshot.events) {
      if (!authorized(options, signal)) return;
      const accepted = options.response.write(
        `id: ${event.id}\nevent: ${options.eventName}\ndata: ${JSON.stringify(event)}\n\n`,
      );
      if (!accepted) await once(options.response, 'drain', { signal });
      after = event.id;
      if (options.isFinal(event)) return;
    }
    if (snapshot.finishedAt !== undefined && snapshot.events.length === 0) return;
    await pause(1000, signal);
    if (!authorized(options, signal)) return;
    snapshot = await readUntilClosed(() => options.read(after), signal);
  }
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** La requête HTTP se termine sans attendre un accès stockage encore en vol. */
async function readUntilClosed<Event extends { id: string }>(
  read: () => Promise<ProgressBatch<Event>>,
  signal: AbortSignal,
): Promise<ProgressBatch<Event>> {
  let abort: () => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error('Connexion fermée'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    if (signal.aborted) abort();
    return await Promise.race([read(), cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
