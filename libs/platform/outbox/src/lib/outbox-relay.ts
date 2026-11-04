export interface OutgoingMessage {
  id: string;
  organizationId: string;
  type: string;
  body: unknown;
}
export interface MessagePublisher {
  publish(message: OutgoingMessage): Promise<void>;
}
export interface OutboxStore {
  /** Verrouille une ligne et ne la marque publiée qu'après succès du callback. */
  publishNext(publish: (message: OutgoingMessage) => Promise<void>): Promise<boolean>;
}
export class OutboxRelay {
  constructor(
    private readonly store: OutboxStore,
    private readonly publisher: MessagePublisher,
  ) {}
  deliverOne(): Promise<boolean> {
    return this.store.publishNext((message) => this.publisher.publish(message));
  }
}
