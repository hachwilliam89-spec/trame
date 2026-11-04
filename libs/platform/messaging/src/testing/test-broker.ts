import { reserveTcpPort } from './reserve-tcp-port';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
export interface TestBroker {
  url: string;
  restart(): Promise<void>;
  stop(): Promise<void>;
}
export async function startTestBroker(): Promise<TestBroker> {
  const port = await reserveTcpPort();
  const container = await new RabbitMQContainer(
    'rabbitmq:4.3.7-management-alpine@sha256:1528a88eebf2bc4d0ab7e9d5d9bc542e9bdf5e1b105e65848fcf8de5c2186528',
  )
    .withExposedPorts({ container: 5672, host: port })
    .withEnvironment({
      RABBITMQ_DEFAULT_USER: 'trame-test',
      RABBITMQ_DEFAULT_PASS: 'local-test-only',
    })
    .withStartupTimeout(120_000)
    .start();
  const url = new URL(container.getAmqpUrl());
  url.username = 'trame-test';
  url.password = 'local-test-only';
  return {
    url: url.toString(),
    restart: () => container.restart(),
    stop: async () => {
      await container.stop();
    },
  };
}
