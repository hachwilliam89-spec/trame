import { allExist, resourceExists } from './resource-exists';

class NotFoundError extends Error {}

describe('resourceExists', () => {
  it('répond vrai quand la lecture aboutit', async () => {
    expect(await resourceExists(async () => 'site', [NotFoundError])).toBe(true);
  });

  it('répond faux quand la lecture lève une erreur « introuvable » attendue', async () => {
    const read = async () => {
      throw new NotFoundError();
    };

    expect(await resourceExists(read, [NotFoundError])).toBe(false);
  });

  it('laisse remonter toute autre erreur : une panne n’est pas une absence', async () => {
    const read = async () => {
      throw new Error('base injoignable');
    };

    await expect(resourceExists(read, [NotFoundError])).rejects.toThrow('base injoignable');
  });
});

describe('allExist', () => {
  const known = new Set(['a', 'b']);
  const isKnown = async (identifier: string) => known.has(identifier);

  it('exige que chaque identifiant existe', async () => {
    expect(await allExist(['a', 'b'], isKnown)).toBe(true);
    expect(await allExist(['a', 'z'], isKnown)).toBe(false);
  });

  it('répond vrai pour une liste vide', async () => {
    expect(await allExist([], isKnown)).toBe(true);
  });
});
