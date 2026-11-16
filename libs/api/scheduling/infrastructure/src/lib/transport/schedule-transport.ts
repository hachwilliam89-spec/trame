import type { Message } from 'amqplib';
import type { PrismaService } from '@trame/api/database';
import {
  ReceiveScheduleReport,
  UnmatchedScheduleReportError,
} from '@trame/api/scheduling/application';
import { InconsistentScheduleError } from '@trame/api/scheduling/domain';
import type { Clock } from '@trame/platform/clock';
import type { IdGenerator } from '@trame/platform/ids';
import { acknowledgeAfterCommit } from '@trame/platform/inbox';
import type { AmqpSession } from '@trame/platform/messaging';
import { OutboxRelay } from '@trame/platform/outbox';
import {
  type ScheduleReportedV1,
  type ScheduleTopologyV1,
  scheduleReportedV1,
  scheduleRequestedV1,
} from '@trame/shared/contracts';
import { z, ZodError } from 'zod';
import { PrismaOutboxStore } from '../persistence/prisma-outbox-store';
import { PrismaScheduleReports } from '../persistence/prisma-schedule-reports';
import { DatabaseRecovery, errorTypeOf, parseJsonBody } from './transport-support';

/** Une demande comme un rapport de génération tiennent en 1 Mio : le worker borne les deux. */
const MAX_SCHEDULE_MESSAGE_BYTES = 1024 * 1024;
const SCHEDULE_REQUESTED = 'scheduling.schedule-requested.v1';

/**
 * Le strict nécessaire pour rattacher un message en rebut à sa génération, même si le reste du
 * message est invalide. Le rattachement est ensuite vérifié contre la demande publiée.
 */
const deadLetterEnvelope = z.discriminatedUnion('type', [
  z.object({
    id: z.uuid(),
    organizationId: z.uuid(),
    type: z.literal(SCHEDULE_REQUESTED),
    payload: z.object({ generationId: z.uuid() }),
  }),
  z.object({
    organizationId: z.uuid(),
    type: z.literal('scheduling.schedule-reported.v1'),
    payload: z.object({ generationId: z.uuid(), requestId: z.uuid() }),
  }),
]);

export interface ScheduleTransportOptions {
  prisma: PrismaService;
  signal?: AbortSignal;
  session: AmqpSession;
  topology: ScheduleTopologyV1;
  clock: Clock;
  ids: IdGenerator;
  logError: (errorType: string) => void;
}

/** Relaie les demandes de génération et reçoit leurs rapports, à côté du diagnostic. */
export class ScheduleTransport {
  private readonly relay: OutboxRelay;
  private readonly receive: ReceiveScheduleReport;
  private readonly recovery: DatabaseRecovery;

  constructor(private readonly options: ScheduleTransportOptions) {
    this.recovery = new DatabaseRecovery(options);
    this.receive = new ReceiveScheduleReport(
      new PrismaScheduleReports(options.prisma, options.clock),
      options.clock,
    );
    const store = new PrismaOutboxStore(options.prisma, options.clock, [SCHEDULE_REQUESTED]);
    this.relay = new OutboxRelay(store, {
      publish: async (message) => {
        const body = scheduleRequestedV1.parse(message.body);
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
    await this.recovery.commit(async () => {
      await this.relay.deliverOne();
    });
  }

  private async handleReport(message: Message): Promise<void> {
    const { session } = this.options;
    try {
      const report = scheduleReportedV1.parse(
        parseJsonBody(message.content, MAX_SCHEDULE_MESSAGE_BYTES),
      );
      await acknowledgeAfterCommit(
        () => this.recovery.commit(() => this.receive.execute(report)),
        () => session.receiver.ack(message),
      );
    } catch (error) {
      this.options.logError(errorTypeOf(error));
      // reject, et non nack : RabbitMQ 4.3 compte ainsi l'échec, jusqu'à la file de rebut.
      session.receiver.reject(message, !isPermanent(error));
    }
  }

  private async handleDeadLetter(message: Message): Promise<void> {
    const { session, topology } = this.options;
    try {
      await this.recovery.commit(() => this.failKnownGeneration(message.content));
      // Le parking garde le message pour diagnostic ; aucune lecture automatique de ce parking.
      await session.publish(
        { exchange: topology.exchange, routingKey: topology.parking.routingKey },
        message.content,
      );
      session.receiver.ack(message);
    } catch (error) {
      this.options.logError(errorTypeOf(error));
      session.receiver.reject(message, true);
    }
  }

  /**
   * Une demande ou un rapport en rebut fait échouer sa génération, si elle n'est pas terminée :
   * sinon l'écran attendrait indéfiniment un résultat qui ne viendra plus.
   */
  private async failKnownGeneration(body: Buffer): Promise<void> {
    const failure = this.failureFor(body);
    if (failure === undefined) {
      return;
    }
    try {
      await this.receive.execute(failure);
    } catch (error) {
      if (error instanceof UnmatchedScheduleReportError) {
        return;
      }
      throw error;
    }
  }

  private failureFor(body: Buffer): ScheduleReportedV1 | undefined {
    let content: unknown;
    try {
      content = parseJsonBody(body, MAX_SCHEDULE_MESSAGE_BYTES);
    } catch {
      return undefined;
    }
    const envelope = deadLetterEnvelope.safeParse(content);
    if (!envelope.success) {
      return undefined;
    }
    const known = envelope.data;
    const isRequest = known.type === SCHEDULE_REQUESTED;
    // Une demande a épuisé ses reprises ; un rapport refusé n'a pas pu être enregistré.
    const code = isRequest ? 'RETRIES_EXHAUSTED' : 'PROCESSING_FAILED';
    const requestId = isRequest ? known.id : known.payload.requestId;
    return scheduleReportedV1.parse({
      id: this.options.ids.next(),
      organizationId: known.organizationId,
      type: 'scheduling.schedule-reported.v1',
      occurredAt: this.options.clock.now().toString(),
      payload: {
        generationId: known.payload.generationId,
        requestId,
        report: { kind: 'FAILED', code },
      },
    });
  }
}

/** Un message illisible, sans demande ou incohérent ne réussira jamais : pas de nouvel essai. */
function isPermanent(error: unknown): boolean {
  return (
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    error instanceof UnmatchedScheduleReportError ||
    error instanceof InconsistentScheduleError
  );
}
