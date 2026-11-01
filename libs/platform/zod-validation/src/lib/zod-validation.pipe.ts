import type { PipeTransform } from '@nestjs/common';
import { ProblemDetailsException } from '@trame/platform/problem-details';
import type { z } from 'zod';

/** Détail d'un champ invalide, au format des exemples de la RFC 9457 (`pointer` en JSON Pointer). */
export interface InvalidParam {
  pointer: string;
  detail: string;
  code: string;
}

/** Convertit un chemin zod en JSON Pointer (RFC 6901), préfixé par `#`. */
export function toJsonPointer(path: readonly PropertyKey[]): string {
  const escaped = path.map((segment) =>
    String(segment).replaceAll('~', '~0').replaceAll('/', '~1'),
  );
  return `#/${escaped.join('/')}`;
}

/**
 * Valide une entrée avec un schéma zod de `@trame/shared/contracts` (ADR-0018).
 * En cas d'échec : `400` au format problem+json, avec la liste des champs invalides dans `errors`.
 *
 * Usage : `@Body(new ZodValidationPipe(createSiteRequest)) body: CreateSiteRequest`.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const errors: InvalidParam[] = result.error.issues.map((issue) => ({
      pointer: toJsonPointer(issue.path),
      detail: issue.message,
      code: issue.code,
    }));
    throw new ProblemDetailsException({
      status: 400,
      detail: 'La requête contient des données invalides.',
      errors,
    });
  }
}
