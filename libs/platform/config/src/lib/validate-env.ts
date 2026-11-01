import { z } from 'zod';

/** Configuration refusée au démarrage : le message liste chaque variable fautive. */
export class ConfigValidationError extends Error {
  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    const lines = issues.map(
      (issue) => `- ${issue.path.join('.') || '(racine)'} : ${issue.message}`,
    );
    super(`Configuration invalide, démarrage annulé :\n${lines.join('\n')}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Valide un environnement brut avec un schéma zod et renvoie la configuration typée.
 * Toute variable manquante ou invalide lève une `ConfigValidationError`.
 */
export function validateEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  env: Record<string, unknown>,
): z.output<TSchema> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }
  return result.data;
}
