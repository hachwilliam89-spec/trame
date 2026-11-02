import { pageFrom, pageOf } from './page';

const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

describe('pageFrom', () => {
  it("donne un curseur quand l'élément en trop existe", () => {
    expect(pageFrom(items.slice(0, 3), 2)).toEqual({ items: items.slice(0, 2), nextCursor: 'b' });
  });

  it('ne donne pas de curseur sur la dernière page', () => {
    expect(pageFrom(items.slice(0, 2), 2)).toEqual({ items: items.slice(0, 2), nextCursor: null });
  });

  it('accepte une page vide', () => {
    expect(pageFrom([], 2)).toEqual({ items: [], nextCursor: null });
  });
});

describe('pageOf', () => {
  it('parcourt toutes les pages sans doublon ni oubli', () => {
    const seen: string[] = [];
    let after: string | undefined;

    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = pageOf(
        items.toReversed(),
        after === undefined ? { limit: 2 } : { limit: 2, after },
      );
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) {
        break;
      }
      after = page.nextCursor;
    }

    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it("trie caractère par caractère, et non selon l'ordre alphabétique d'une langue", () => {
    // L'ordre alphabétique de la langue placerait « a… » avant « B… » ; l'ordre des caractères, non.
    const mixed = [{ id: 'a1' }, { id: 'B2' }, { id: '0f' }];

    expect(pageOf(mixed, { limit: 10 }).items.map((item) => item.id)).toEqual(['0f', 'B2', 'a1']);
  });
});
