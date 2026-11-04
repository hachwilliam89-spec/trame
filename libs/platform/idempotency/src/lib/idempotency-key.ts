/** Une clé opaque : aucune normalisation ne doit fusionner deux demandes distinctes. */
export class IdempotencyKey {
  private constructor(readonly value: string) {}

  static of(value: unknown): IdempotencyKey {
    if (typeof value !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(value)) {
      throw new InvalidIdempotencyKeyError();
    }
    return new IdempotencyKey(value);
  }
}

export class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super('Idempotency-Key doit contenir de 1 à 128 caractères ASCII visibles sans espace.');
  }
}
