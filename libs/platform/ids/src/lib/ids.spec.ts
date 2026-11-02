import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from './sequential-id-generator';
import { UuidV7Generator } from './uuid-v7-generator';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function timestampOf(id: string): number {
  const timestampHex = id.replaceAll('-', '').slice(0, 12);
  return Number.parseInt(timestampHex, 16);
}

/** Vrai si chaque identifiant est strictement plus grand que le précédent, caractère par caractère. */
function isStrictlyIncreasing(ids: string[]): boolean {
  for (let index = 1; index < ids.length; index++) {
    const previous = ids[index - 1] ?? '';
    const current = ids[index] ?? '';
    if (current <= previous) {
      return false;
    }
  }
  return true;
}

describe('UuidV7Generator', () => {
  it("produit des UUID v7 dont l'horodatage vient de l'horloge", () => {
    const clock = new FixedClock('2026-11-02T10:00:00Z');
    const ids = new UuidV7Generator(clock);

    const id = ids.next();

    expect(id).toMatch(UUID_V7);
    expect(timestampOf(id)).toBe(clock.now().epochMilliseconds);
  });

  it("garde l'ordre de création quand l'horloge avance", () => {
    const clock = new FixedClock('2026-11-02T10:00:00Z');
    const ids = new UuidV7Generator(clock);

    const first = ids.next();
    clock.advance({ milliseconds: 1 });
    const second = ids.next();

    expect(isStrictlyIncreasing([first, second])).toBe(true);
  });

  it("garde l'ordre de création dans la même milliseconde", () => {
    const ids = new UuidV7Generator(new FixedClock('2026-11-02T10:00:00Z'));

    const created: string[] = [];
    for (let count = 0; count < 10_000; count++) {
      created.push(ids.next());
    }

    expect(isStrictlyIncreasing(created)).toBe(true);
    expect(created.every((id) => UUID_V7.test(id))).toBe(true);
  });

  it("garde l'ordre de création quand l'horloge recule", () => {
    const clock = new FixedClock('2026-11-02T10:00:00Z');
    const ids = new UuidV7Generator(clock);

    const first = ids.next();
    clock.set('2026-11-02T09:59:59Z');
    const second = ids.next();

    expect(isStrictlyIncreasing([first, second])).toBe(true);
    expect(timestampOf(second)).toBe(timestampOf(first));
  });
});

describe('SequentialIdGenerator', () => {
  it('produit des UUID valides et prévisibles', () => {
    const ids = new SequentialIdGenerator();

    expect(ids.next()).toBe('00000000-0000-7000-8000-000000000001');
    expect(ids.next()).toBe('00000000-0000-7000-8000-000000000002');
  });
});
