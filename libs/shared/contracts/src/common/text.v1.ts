import { z } from 'zod';

/**
 * Texte obligatoire saisi par un utilisateur (nom, libellé) : au moins un caractère visible, et
 * `maxLength` caractères au plus. Le caractère NUL est refusé ici, à la frontière : PostgreSQL ne
 * peut pas le stocker dans un texte, et l'accepter donnerait une erreur 500 à l'écriture.
 */
export function requiredText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/\S/, { error: 'Ce texte doit contenir au moins un caractère visible.' })
    .regex(/^[^\0]*$/, {
      error: 'Ce texte contient un caractère NUL, qui ne peut pas être enregistré.',
    });
}
