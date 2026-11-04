import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { PrismaService } from '@trame/api/database';
import { DiagnosticTransport } from '@trame/api/scheduling/infrastructure';
import { SystemClock } from '@trame/platform/clock';
import { UuidV7Generator } from '@trame/platform/ids';
import { AmqpSession } from '@trame/platform/messaging';
import { diagnosticTopologyV1 } from '@trame/shared/contracts';
import pino from 'pino';
import { transportSettings } from './settings';

async function main(): Promise<void> {
  const settings = transportSettings.parse(process.env);
  const logger = pino({ level: settings.LOG_LEVEL });
  const topology = diagnosticTopologyV1.parse(
    JSON.parse(await readFile(settings.DIAGNOSTIC_TOPOLOGY_FILE, 'utf8')),
  );
  const prisma = new PrismaService({ url: settings.DATABASE_URL, requestTimeoutMs: 5_000 });
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    while (!stop.signal.aborted) {
      await connectAndRun({ settings, topology, prisma, logger, stop });
      await pause(5_000, stop.signal);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function connectAndRun(options: {
  settings: ReturnType<typeof transportSettings.parse>;
  topology: ReturnType<typeof diagnosticTopologyV1.parse>;
  prisma: PrismaService;
  logger: pino.Logger;
  stop: AbortController;
}): Promise<void> {
  let session: AmqpSession | undefined;
  try {
    session = await AmqpSession.open(options.settings.AMQP_URL);
    const { topology } = options;
    await session.declare(topology.exchange, [
      topology.parking,
      topology.deadLetters,
      topology.requests,
      topology.reports,
    ]);
    const transport = new DiagnosticTransport({
      prisma: options.prisma,
      signal: options.stop.signal,
      session,
      topology,
      clock: new SystemClock(),
      ids: new UuidV7Generator(new SystemClock()),
      logError: (errorType) =>
        options.logger.warn({ event: 'diagnostic_delivery_rejected', errorType }),
    });
    await transport.startConsumers();
    options.logger.info({ event: 'diagnostic_transport_ready' });
    while (!options.stop.signal.aborted) {
      await transport.tick();
      await pause(100, options.stop.signal);
    }
  } catch (error) {
    options.logger.warn({
      event: 'diagnostic_transport_retry',
      errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
    });
  } finally {
    await session?.close();
  }
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
    JSON.stringify({
      event: 'diagnostic_transport_failed',
      errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
    }) + '\n',
  );
  process.exitCode = 1;
});
