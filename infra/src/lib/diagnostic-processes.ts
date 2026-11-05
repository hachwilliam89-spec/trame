import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { isolatedEnvironment } from './compose';
export async function startDiagnosticProcesses(options: { databaseUrl: string; amqpUrl: string }) {
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
