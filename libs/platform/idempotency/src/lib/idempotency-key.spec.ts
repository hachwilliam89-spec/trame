import { IdempotencyKey, InvalidIdempotencyKeyError } from './idempotency-key';
describe('Clé d’idempotence', () => {
  it('conserve exactement une clé ASCII visible de 1 à 128 caractères', () => {
    for (const key of ['A', 'demo-2026:request_1', 'x'.repeat(128)]) {
      expect(IdempotencyKey.of(key).value).toBe(key);
    }
  });
  it.each(
    [
      undefined,
      null,
      '',
      'x'.repeat(129),
      'avec espace',
      'é',
      '\t',
      'visible\n',
      '\u007f',
      123,
      ['une', 'autre'],
    ].map((key) => [key]),
  )('refuse une clé invalide (%j)', (key) => {
    expect(() => IdempotencyKey.of(key)).toThrow(InvalidIdempotencyKeyError);
  });
});
