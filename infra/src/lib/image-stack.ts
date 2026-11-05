import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { isolatedEnvironment, ENV_EXAMPLE_PATH } from './compose';

const execute = promisify(execFile);
const root = resolve(__dirname, '../../..');

export interface ImageStack {
  project: string;
  webPort: number;
  keycloakPort: number;
}

export async function imageCompose(stack: ImageStack, args: string[]): Promise<string> {
  return docker(
    [
      'compose',
      '--project-name',
      stack.project,
      '--env-file',
      ENV_EXAMPLE_PATH,
      '--file',
      'infra/compose/images-test.yml',
      ...args,
    ],
    {
      IMAGE_WEB_PORT: String(stack.webPort),
      IMAGE_KEYCLOAK_PORT: String(stack.keycloakPort),
    },
  );
}

export async function docker(
  args: string[],
  overrides: Record<string, string> = {},
): Promise<string> {
  const result = await execute('docker', args, {
    cwd: root,
    env: await isolatedEnvironment(overrides),
    timeout: 900_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}
