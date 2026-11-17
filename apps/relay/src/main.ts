import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { PrismaService } from '@trame/api/database';
import { DiagnosticTransport, ScheduleTransport } from '@trame/api/scheduling/infrastructure';
import { SystemClock } from '@trame/platform/clock';
import { UuidV7Generator } from '@trame/platform/ids';
import { AmqpSession } from '@trame/platform/messaging';
import {
  type DiagnosticTopologyV1,
  type ScheduleTopologyV1,
  diagnosticTopologyV1,
  scheduleTopologyV1,
} from '@trame/shared/contracts';
import pino from 'pino';
import { Liveness } from './liveness';
import { type TransportSettings, transportSettings } from './settings';

interface Topologies {
  diagnostic: DiagnosticTopologyV1;
  schedule: ScheduleTopologyV1;
}

interface RunOptions {
  settings: TransportSettings;
  topologies: Topologies;
  prisma: PrismaService;
  logger: pino.Logger;
  stop: AbortController;
}

async function main(): Promise<void> {
  const settings = transportSettings.parse(process.env);
  const logger = pino({ level: settings.LOG_LEVEL });
  const topologies: Topologies = {
    diagnostic: diagnosticTopologyV1.parse(await readJson(settings.DIAGNOSTIC_TOPOLOGY_FILE)),
    schedule: scheduleTopologyV1.parse(await readJson(settings.SCHEDULE_TOPOLOGY_FILE)),
  };
  const prisma = new PrismaService({ url: settings.DATABASE_URL, requestTimeoutMs: 5_000 });
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    while (!stop.signal.aborted) {
      await connectAndRun({ settings, topologies, prisma, logger, stop });
      await pause(5_000, stop.signal);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** Les deux transports partagent la connexion et tournent dans la même boucle. */
async function connectAndRun(options: RunOptions): Promise<void> {
  let session: AmqpSession | undefined;
  try {
    session = await AmqpSession.open(options.settings.AMQP_URL);
    const transports = await startTransports(session, options);
    options.logger.info({ event: 'transport_ready' });
    const livenessFile = options.settings.RELAY_LIVENESS_FILE;
    const liveness =
      livenessFile === undefined ? undefined : new Liveness(livenessFile, new SystemClock());
    while (!options.stop.signal.aborted) {
      for (const transport of transports) {
        await transport.tick();
      }
      await liveness?.beat();
      await pause(100, options.stop.signal);
    }
  } catch (error) {
    options.logger.warn({ event: 'transport_retry', errorType: errorTypeOf(error) });
  } finally {
    await session?.close();
  }
}

async function startTransports(
  session: AmqpSession,
  options: RunOptions,
): Promise<(DiagnosticTransport | ScheduleTransport)[]> {
  const { diagnostic, schedule } = options.topologies;
  for (const topology of [diagnostic, schedule]) {
    await session.declare(topology.exchange, [
      topology.parking,
      topology.deadLetters,
      topology.requests,
      topology.reports,
    ]);
  }
  const clock = new SystemClock();
  const shared = {
    prisma: options.prisma,
    signal: options.stop.signal,
    session,
    clock,
    ids: new UuidV7Generator(clock),
  };
  const transports = [
    new DiagnosticTransport({
      ...shared,
      topology: diagnostic,
      logError: (errorType) =>
        options.logger.warn({ event: 'delivery_rejected', flow: 'diagnostic', errorType }),
    }),
    new ScheduleTransport({
      ...shared,
      topology: schedule,
      logError: (errorType) =>
        options.logger.warn({ event: 'delivery_rejected', flow: 'schedule', errorType }),
    }),
  ];
  for (const transport of transports) {
    await transport.startConsumers();
  }
  return transports;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'UnknownError';
}

async function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  try {
    await setTimeout(milliseconds, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) {
      throw error;
    }
  }
}

void main().catch((error: unknown) => {
  // Une erreur de configuration ne doit pas exposer une URL avec mot de passe.
  process.stderr.write(
    JSON.stringify({ event: 'transport_failed', errorType: errorTypeOf(error) }) + '\n',
  );
  process.exitCode = 1;
});
