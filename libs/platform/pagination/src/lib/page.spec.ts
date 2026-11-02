import { pageFrom, pageOfSorted } from './page';

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

describe('pageOfSorted', () => {
  it('parcourt toutes les pages sans doublon ni oubli', () => {
    const seen: string[] = [];
    let after: string | undefined;

    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = pageOfSorted(items, after === undefined ? { limit: 2 } : { limit: 2, after });
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) {
        break;
      }
      after = page.nextCursor;
    }

    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
