import {
  diagnosticProgressV1,
  scheduleGenerationProgressV1,
  type DiagnosticProgressV1,
  type ScheduleGenerationProgressV1,
} from '@trame/shared/contracts/scheduling';
import { createParser } from 'eventsource-parser';

/** Un flux SSE de progression : l'événement attendu, sa validation et sa fin. */
interface ProgressStream<Event> {
  /** Nom de l'événement SSE ; les autres sont ignorés. */
  eventName: string;
  /** Valide le message ; lève une erreur s'il est invalide ou étranger au suivi demandé. */
  parse(data: unknown): Event;
  idOf(event: Event): string;
  isFinal(event: Event): boolean;
}

/** Progression d'un diagnostic, jusqu'à son rapport final. */
export function readProgress(
  response: Response,
  runId: string,
  receive: (event: DiagnosticProgressV1) => void,
): Promise<void> {
  return readServerEvents(
    response,
    {
      eventName: 'diagnostic',
      parse: (data) => {
        const event = diagnosticProgressV1.parse(data);
        if (event.runId !== runId) throw new Error('Progression incohérente');
        return event;
      },
      idOf: (event) => event.id,
      isFinal: (event) => event.report.kind !== 'STARTED',
    },
    receive,
  );
}

/** Progression d'une génération de planning, jusqu'à son issue. */
export function readScheduleGenerationProgress(
  response: Response,
  generationId: string,
  receive: (event: ScheduleGenerationProgressV1) => void,
): Promise<void> {
  return readServerEvents(
    response,
    {
      eventName: 'schedule-generation',
      parse: (data) => {
        const event = scheduleGenerationProgressV1.parse(data);
        if (event.generationId !== generationId) throw new Error('Progression incohérente');
        return event;
      },
      idOf: (event) => event.id,
      isFinal: (event) => event.status !== 'RUNNING',
    },
    receive,
  );
}

/** Décode les frontières SSE indépendamment des frontières des paquets réseau. */
async function readServerEvents<Event>(
  response: Response,
  stream: ProgressStream<Event>,
  receive: (event: Event) => void,
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
      if (terminal || message.event !== stream.eventName) return;
      const event = stream.parse(JSON.parse(message.data));
      if (message.id !== stream.idOf(event)) throw new Error('Progression incohérente');
      receive(event);
      terminal = stream.isFinal(event);
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
