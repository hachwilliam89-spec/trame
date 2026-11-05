import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { expect } from 'vitest';
import { z } from 'zod';
import { isolatedEnvironment } from './compose';
import { queryDatabase } from './dev-stack';

// Vérification externe du format HTTP ; ce test ne dépend pas des modules de l'API.
const diagnosticRunV1 = z.object({ id: z.uuid() });
const diagnosticProgressV1 = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  sequence: z.int(),
  report: z.object({ kind: z.string(), outcome: z.unknown().optional() }),
});

/** Parcours réel : même jeton que le navigateur, API construite et deux processus réels. */
export async function proveDiagnosticProgress(options: {
  baseUrl: string;
  accessToken: string;
  databaseUrl: string;
  amqpUrl: string;
}): Promise<void> {
  const headers = { authorization: 'Bearer ' + options.accessToken };
  const created = await fetch(options.baseUrl + '/diagnostics/solver-runs', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': 'sse-proof' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  expect(created.status).toBe(202);
  const run = diagnosticRunV1.parse(await created.json());
  expect(created.headers.get('x-correlation-id')).toBe(run.id);
  const path = options.baseUrl + '/diagnostics/solver-runs/' + run.id;
  const stream = await fetch(path + '/events', { headers, signal: AbortSignal.timeout(30_000) });
  expect(stream.status).toBe(200);
  const processes = await startProcesses(options);
  try {
    const first = await firstProgress(stream);
    expect(first).toMatchObject({ runId: run.id, sequence: 1, report: { kind: 'STARTED' } });
    const resumed = await fetch(path + '/events', {
      headers: { ...headers, 'last-event-id': first.id },
      signal: AbortSignal.timeout(30_000),
    });
    expect(resumed.status).toBe(200);
    const events = parseProgress(await resumed.text());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      runId: run.id,
      sequence: 2,
      report: { kind: 'RESULT', outcome: { result: { status: 'OPTIMAL', solution: { cost: 5 } } } },
    });
    const result = await fetch(path, { headers });
    expect(await result.json()).toMatchObject({ id: run.id, status: 'SUCCEEDED' });
    const messages = await queryDatabase(
      options.databaseUrl,
      'SELECT body FROM scheduling.outbox_messages',
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({ payload: expect.objectContaining({ runId: run.id }) }),
        }),
      ]),
    );
    await expect.poll(() => processes.logs(), { timeout: 5000 }).toContain(run.id);
  } finally {
    await processes.stop();
  }
}

function parseProgress(text: string) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => diagnosticProgressV1.parse(JSON.parse(line.slice(6))));
}

async function firstProgress(response: Response) {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('Flux SSE absent');
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('Flux fermé sans progression');
      text += decoder.decode(chunk.value, { stream: true });
      const boundary = text.indexOf('\n\n');
      if (boundary < 0) continue;
      const first = parseProgress(text.slice(0, boundary))[0];
      if (first !== undefined) return first;
      text = text.slice(boundary + 2);
    }
  } finally {
    await reader.cancel();
  }
}

async function startProcesses(options: { databaseUrl: string; amqpUrl: string }) {
  const root = resolve(__dirname, '../../..');
  const env = await isolatedEnvironment({
    DATABASE_URL: options.databaseUrl,
    AMQP_URL: options.amqpUrl,
    DIAGNOSTIC_TOPOLOGY_FILE: resolve(root, 'infra/rabbitmq/diagnostic-topology.json'),
  });
  const transport = spawn(
    resolve(root, 'node_modules/.bin/tsx'),
    ['--tsconfig', 'tsconfig.base.json', 'tools/diagnostic-transport/src/main.ts'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const worker = spawn('uv', ['run', '--frozen', 'python', '-m', 'trame_engine.worker'], {
    cwd: resolve(root, 'apps/engine'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  for (const child of [transport, worker]) {
    child.stdout.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
  }
  return {
    logs: () => logs,
    stop: () => Promise.all([stopProcess(transport), stopProcess(worker)]),
  };
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}
