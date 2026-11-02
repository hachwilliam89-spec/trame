import { ParseUUIDPipe } from '@nestjs/common';
import { ProblemDetailsException } from '@trame/platform/problem-details';

/**
 * Identifiant de ressource lu dans l'URL. Mal formé, il ne désigne aucune ressource : la réponse
 * est un 404, comme pour une ressource absente, plutôt qu'une erreur de validation.
 */
export const resourceIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ProblemDetailsException({ status: 404, detail: 'Ressource introuvable.' }),
});
