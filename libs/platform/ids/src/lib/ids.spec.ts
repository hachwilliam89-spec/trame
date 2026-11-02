import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from './sequential-id-generator';
import { UuidV7Generator } from './uuid-v7-generator';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UuidV7Generator', () => {
  it("produit des UUID v7 dont l'horodatage vient de l'horloge", () => {
    const clock = new FixedClock('2026-11-02T10:00:00Z');
    const ids = new UuidV7Generator(clock);

    const id = ids.next();

    expect(id).toMatch(UUID_V7);
    const timestampHex = id.replaceAll('-', '').slice(0, 12);
    expect(Number.parseInt(timestampHex, 16)).toBe(clock.now().epochMilliseconds);
  });

  it("produit des identifiants triés dans l'ordre de création", () => {
    const clock = new FixedClock('2026-11-02T10:00:00Z');
    const ids = new UuidV7Generator(clock);

    const first = ids.next();
    clock.advance({ milliseconds: 1 });
    const second = ids.next();

    expect([second, first].sort()).toEqual([first, second]);
  });
});

describe('SequentialIdGenerator', () => {
  it('produit des UUID valides et prévisibles', () => {
    const ids = new SequentialIdGenerator();

    expect(ids.next()).toBe('00000000-0000-7000-8000-000000000001');
    expect(ids.next()).toBe('00000000-0000-7000-8000-000000000002');
  });
});
