import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { type Observable, catchError, throwError } from 'rxjs';
import { type ErrorMapping, translateError } from './error-mapping';

/**
 * Traduit les erreurs métier en réponses problem+json, pour un contrôleur.
 *
 * Le domaine et les use cases ignorent HTTP : c'est l'adaptateur qui déclare quelle erreur
 * devient quel statut. Le message de l'erreur est renvoyé au client : il doit être rédigé
 * pour l'utilisateur, en français, et ne contenir aucune donnée personnelle.
 *
 * Usage : `@UseInterceptors(new ErrorMappingInterceptor(siteErrorMappings))`.
 */
export class ErrorMappingInterceptor implements NestInterceptor {
  constructor(private readonly mappings: readonly ErrorMapping[]) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(catchError((error: unknown) => throwError(() => translateError(error, this.mappings))));
  }
}
