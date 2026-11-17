import { parseArgs } from 'node:util';
import { validateEnv } from '@trame/platform/config';
import { z } from 'zod';

const USAGE = 'Usage : node load-demo.js --organization <UUID de l’organisation>';

/** Même règle que l'API pour l'adresse de la base (`config/env.schema.ts`). */
const loadDemoEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

/** Appel mal formé : le message rappelle l'usage. */
export class LoadDemoUsageError extends Error {
  constructor(problem: string) {
    super(`${problem}\n${USAGE}`);
    this.name = 'LoadDemoUsageError';
  }
}

export interface LoadDemoCommand {
  organizationId: string;
  databaseUrl: string;
}

/**
 * Lit l'appel de la commande opérateur. L'organisation est l'attribut `organization_id` du compte
 * Keycloak qui verra la démonstration.
 */
export function readLoadDemoCommand(
  args: readonly string[],
  env: Record<string, unknown>,
): LoadDemoCommand {
  const organizationId = readOrganizationId(args);
  const { DATABASE_URL } = validateEnv(loadDemoEnvSchema, env);
  return { organizationId, databaseUrl: DATABASE_URL };
}

function readOrganizationId(args: readonly string[]): string {
  let values: { organization?: string };
  try {
    values = parseArgs({
      args: [...args],
      options: { organization: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch {
    throw new LoadDemoUsageError('Appel non reconnu.');
  }
  const organizationId = z.uuid().safeParse(values.organization);
  if (!organizationId.success) {
    throw new LoadDemoUsageError('L’organisation doit être un UUID.');
  }
  return organizationId.data;
}
