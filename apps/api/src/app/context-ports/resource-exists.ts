type ErrorClass = new (...parameters: never[]) => Error;

/**
 * Vrai si `read` aboutit, faux s'il lève l'une des erreurs « introuvable » attendues. Toute autre
 * erreur remonte. Les adaptateurs entre contextes s'en servent pour répondre « existe ou non » à partir
 * d'un use case de lecture, qui signale l'absence par une erreur.
 */
export async function resourceExists(
  read: () => Promise<unknown>,
  notFoundErrors: readonly ErrorClass[],
): Promise<boolean> {
  try {
    await read();
    return true;
  } catch (error) {
    const isNotFound = notFoundErrors.some((notFoundError) => error instanceof notFoundError);
    if (isNotFound) {
      return false;
    }
    throw error;
  }
}

/** Vrai si `exists` répond vrai pour chaque identifiant, l'un après l'autre. Vrai pour une liste vide. */
export async function allExist(
  identifiers: readonly string[],
  exists: (identifier: string) => Promise<boolean>,
): Promise<boolean> {
  for (const identifier of identifiers) {
    const found = await exists(identifier);
    if (!found) {
      return false;
    }
  }
  return true;
}
