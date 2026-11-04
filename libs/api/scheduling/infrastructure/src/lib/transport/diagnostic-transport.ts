import { setTimeout } from 'node:timers/promises';
import type { Message } from 'amqplib';
import type { PrismaService } from '@trame/api/database';
import {
  ReceiveDiagnosticReport,
  UnmatchedDiagnosticReportError,
} from '@trame/api/scheduling/application';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { acknowledgeAfterCommit } from '@trame/platform/inbox';
import type { AmqpSession } from '@trame/platform/messaging';
import { OutboxRelay } from '@trame/platform/outbox';
import {
  type DiagnosticReportedV1,
  type DiagnosticTopologyV1,
  diagnosticReportedV1,
  diagnosticRequestedV1,
} from '@trame/shared/contracts';
import { ZodError } from 'zod';
import { PrismaDiagnosticReports } from '../persistence/prisma-diagnostic-reports';
import { PrismaOutboxStore } from '../persistence/prisma-outbox-store';

export interface DiagnosticTransportOptions {
  prisma: PrismaService;
  signal?: AbortSignal;
  session: AmqpSession;
  topology: DiagnosticTopologyV1;
  clock: Clock;
  ids: IdGenerator;
  logError: (errorType: string) => void;
}

/** Processus séparé de HTTP : l'API continue à conserver les demandes pendant son arrêt. */
export class DiagnosticTransport {
  private readonly relay: OutboxRelay;
  private readonly receive: ReceiveDiagnosticReport;
  constructor(private readonly options: DiagnosticTransportOptions) {
    this.receive = new ReceiveDiagnosticReport(
      new PrismaDiagnosticReports(options.prisma, options.clock),
      options.clock,
    );
    this.relay = new OutboxRelay(new PrismaOutboxStore(options.prisma, options.clock), {
      publish: async (message) => {
        const body = diagnosticRequestedV1.parse(message.body);
        await options.session.publish(
          { exchange: options.topology.exchange, routingKey: options.topology.requests.routingKey },
          Buffer.from(JSON.stringify(body)),
        );
      },
    });
  }

  async startConsumers(): Promise<void> {
    const { session, topology } = this.options;
    await session.subscribe(topology.reports.name, (message) => this.handleReport(message));
    await session.subscribe(topology.deadLetters.name, (message) => this.handleDeadLetter(message));
  }

  async tick(): Promise<void> {
    if (!this.options.session.isOpen) {
      throw new Error('Connexion AMQP fermée.');
    }
    await this.commitWithDatabaseRecovery(async () => {
      await this.relay.deliverOne();
    });
  }

  private async handleReport(message: Message): Promise<void> {
    const { session } = this.options;
    try {
      const report = diagnosticReportedV1.parse(parseBody(message.content));
      await acknowledgeAfterCommit(
        () => this.commitWithDatabaseRecovery(() => this.receive.execute(report)),
        () => session.receiver.ack(message),
      );
    } catch (error) {
      this.options.logError(error instanceof Error ? error.constructor.name : 'UnknownError');
      // reject, et non nack : RabbitMQ 4.3 incrémente ainsi le compteur d'échecs.
      const permanent =
        error instanceof ZodError ||
        error instanceof SyntaxError ||
        error instanceof UnmatchedDiagnosticReportError;
      session.receiver.reject(message, !permanent);
    }
  }

  private async handleDeadLetter(message: Message): Promise<void> {
    const { session, topology } = this.options;
    try {
      await this.commitWithDatabaseRecovery(() => this.failKnownRequest(message.content));
      // Le parking garde le message pour diagnostic ; aucune lecture automatique de ce parking.
      await session.publish(
        { exchange: topology.exchange, routingKey: topology.parking.routingKey },
        message.content,
      );
      session.receiver.ack(message);
    } catch (error) {
      this.options.logError(error instanceof Error ? error.constructor.name : 'UnknownError');
      session.receiver.reject(message, true);
    }
  }

  private async commitWithDatabaseRecovery(commit: () => Promise<void>): Promise<void> {
    while (this.options.session.isOpen && !this.options.signal?.aborted) {
      try {
        await commit();
        return;
      } catch (error) {
        if (await this.databaseIsAvailable()) {
          throw error;
        }
        this.options.logError('DatabaseUnavailable');
        // L'indisponibilité d'une dépendance ne consomme pas les reprises du traitement.
        await setTimeout(1_000, undefined, { signal: this.options.signal });
      }
    }
    throw new Error('Transport arrêté avant validation.');
  }

  private async databaseIsAvailable(): Promise<boolean> {
    try {
      await this.options.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async failKnownRequest(body: Buffer): Promise<void> {
    let report: DiagnosticReportedV1 | undefined;
    try {
      report = this.deadLetterReport(parseBody(body));
    } catch {
      return;
    }
    if (report === undefined) {
      return;
    }
    try {
      await this.receive.execute(report);
    } catch (error) {
      if (error instanceof UnmatchedDiagnosticReportError) {
        return;
      }
      throw error;
    }
  }

  private deadLetterReport(body: unknown): DiagnosticReportedV1 | undefined {
    const request = diagnosticRequestedV1.safeParse(body);
    const incoming = diagnosticReportedV1.safeParse(body);
    if (!request.success && !incoming.success) {
      return undefined;
    }
    let organizationId: string;
    let runId: string;
    let requestId: string;
    if (request.success) {
      organizationId = request.data.organizationId;
      runId = request.data.payload.runId;
      requestId = request.data.id;
    } else if (incoming.success) {
      organizationId = incoming.data.organizationId;
      runId = incoming.data.payload.runId;
      requestId = incoming.data.payload.requestId;
    } else {
      return undefined;
    }
    return diagnosticReportedV1.parse({
      id: this.options.ids.next(),
      organizationId,
      type: 'scheduling.diagnostic-reported.v1',
      occurredAt: this.options.clock.now().toString(),
      payload: { runId, requestId, report: { kind: 'FAILED', code: 'RETRIES_EXHAUSTED' } },
    });
  }
}

function parseBody(body: Buffer): unknown {
  if (body.length > 65_536) {
    throw new SyntaxError('Message trop volumineux.');
  }
  return JSON.parse(body.toString('utf8')) as unknown;
}
