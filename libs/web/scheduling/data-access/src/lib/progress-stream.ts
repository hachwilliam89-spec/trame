import {
  diagnosticProgressV1,
  type DiagnosticProgressV1,
} from '@trame/shared/contracts/scheduling';
import { createParser } from 'eventsource-parser';

/** Décode les frontières SSE indépendamment des frontières des paquets réseau. */
export async function readProgress(
  response: Response,
  runId: string,
  receive: (event: DiagnosticProgressV1) => void,
): Promise<void> {
  if (
    !response.headers.get('content-type')?.startsWith('text/event-stream') ||
    response.body === null
  )
    throw new Error('Flux invalide');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let terminal = false;
  const parser = createParser({
    maxBufferSize: 65536,
    onError: () => {
      throw new Error('Progression invalide');
    },
    onEvent: (message) => {
      if (message.event !== 'diagnostic') return;
      const event = diagnosticProgressV1.parse(JSON.parse(message.data));
      if (event.runId !== runId || message.id !== event.id)
        throw new Error('Progression incohérente');
      receive(event);
      terminal = event.report.kind !== 'STARTED';
    },
  });
  try {
    while (!terminal) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.feed(decoder.decode(chunk.value, { stream: true }));
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
