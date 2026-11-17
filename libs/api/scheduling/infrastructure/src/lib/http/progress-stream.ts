import { once } from 'node:events';
import type { Clock } from '@trame/platform/clock';
import type { ProgressSnapshot } from '@trame/api/scheduling/application';
import type { Response } from 'express';

export interface DiagnosticStreamOptions {
  response: Response;
  clock: Clock;
  expiresAt: number;
  initial: ProgressSnapshot;
  read: (after: string | undefined) => Promise<ProgressSnapshot>;
  after?: string;
  onError: (error: unknown) => void;
}

/** Un seul lot en mémoire ; la déconnexion annule aussi l'attente d'un client lent. */
export async function serveDiagnosticStream(options: DiagnosticStreamOptions): Promise<void> {
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

function authorized(options: DiagnosticStreamOptions, signal: AbortSignal): boolean {
  return !signal.aborted && options.clock.now().epochMilliseconds < options.expiresAt;
}

function scheduleConnectionLimits(
  options: DiagnosticStreamOptions,
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

async function sendProgress(options: DiagnosticStreamOptions, signal: AbortSignal): Promise<void> {
  let snapshot = options.initial;
  let after = options.after;
  while (authorized(options, signal)) {
    for (const event of snapshot.events) {
      if (!authorized(options, signal)) return;
      const accepted = options.response.write(
        `id: ${event.id}\nevent: diagnostic\ndata: ${JSON.stringify(event)}\n\n`,
      );
      if (!accepted) await once(options.response, 'drain', { signal });
      after = event.id;
      if (event.report.kind !== 'STARTED') return;
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
async function readUntilClosed(
  read: () => Promise<ProgressSnapshot>,
  signal: AbortSignal,
): Promise<ProgressSnapshot> {
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
