import {
  connect,
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type GetMessage,
  type ConsumeMessage,
} from 'amqplib';
import { publishConfirmed } from './publish-confirmed';
export interface QueueDeclaration {
  name: string;
  routingKey: string;
  arguments: Record<string, string | number | boolean>;
}

/** Un seul envoi confirmé à la fois sur le canal ; réception et publication sont séparées. */
export class AmqpSession {
  private pending = Promise.resolve();
  private active = true;
  get isOpen(): boolean {
    return this.active;
  }
  private constructor(
    private readonly connection: ChannelModel,
    private readonly publisher: ConfirmChannel,
    readonly receiver: Channel,
  ) {
    connection.on('close', () => {
      this.active = false;
    });
    publisher.on('close', () => {
      this.active = false;
    });
    receiver.on('close', () => {
      this.active = false;
    });
  }

  static async open(url: string): Promise<AmqpSession> {
    const connection = await connect(url, { timeout: 5_000 });
    connection.on('error', () => undefined);
    try {
      const publisher = await connection.createConfirmChannel();
      publisher.on('error', () => undefined);
      const receiver = await connection.createChannel();
      receiver.on('error', () => undefined);
      await receiver.prefetch(1);
      return new AmqpSession(connection, publisher, receiver);
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  async declare(exchange: string, queues: QueueDeclaration[]): Promise<void> {
    await this.receiver.assertExchange(exchange, 'direct', { durable: true });
    for (const queue of queues) {
      await this.receiver.assertQueue(queue.name, { durable: true, arguments: queue.arguments });
      await this.receiver.bindQueue(queue.name, exchange, queue.routingKey);
    }
  }

  publish(destination: { exchange: string; routingKey: string }, body: Buffer): Promise<void> {
    const operation = this.pending.then(() => publishConfirmed(this.publisher, destination, body));
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async subscribe(
    queue: string,
    handle: (message: ConsumeMessage) => Promise<void>,
  ): Promise<string> {
    const consumer = await this.receiver.consume(
      queue,
      (message) => {
        if (message === null) {
          void this.close();
          return;
        }
        void handle(message).catch(() => this.close());
      },
      { noAck: false },
    );
    return consumer.consumerTag;
  }

  get(queue: string): Promise<GetMessage | false> {
    return this.receiver.get(queue, { noAck: false });
  }
  async close(): Promise<void> {
    await this.connection.close().catch(() => undefined);
  }
}
