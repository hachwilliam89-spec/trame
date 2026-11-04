import type { ConfirmChannel } from 'amqplib';
export class PublicationNotConfirmedError extends Error {
  constructor() {
    super('Publication non confirmée ou non routée.');
  }
}

/** Un ACK de publication ne suffit pas : un message mandatory peut avoir été retourné. */
export async function publishConfirmed(
  channel: ConfirmChannel,
  destination: { exchange: string; routingKey: string },
  body: Buffer,
  timeoutMs = 5_000,
): Promise<void> {
  let returned = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onReturn = () => {
    returned = true;
  };
  let onClose: () => void = () => undefined;
  channel.on('return', onReturn);
  try {
    await new Promise<void>((resolve, reject) => {
      onClose = () => reject(new PublicationNotConfirmedError());
      channel.once('close', onClose);
      timeout = setTimeout(() => {
        reject(new PublicationNotConfirmedError());
        void channel.close().catch(() => undefined);
      }, timeoutMs);
      channel.publish(
        destination.exchange,
        destination.routingKey,
        body,
        { persistent: true, mandatory: true, contentType: 'application/json' },
        (error: unknown) => {
          if (error || returned) {
            reject(new PublicationNotConfirmedError());
            return;
          }
          resolve();
        },
      );
    });
  } finally {
    clearTimeout(timeout);
    channel.off('return', onReturn);
    channel.off('close', onClose);
  }
}
