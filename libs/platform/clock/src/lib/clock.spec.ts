import { Test } from '@nestjs/testing';
import { CLOCK, ClockModule } from './clock.module';
import type { Clock } from './clock';
import { FixedClock } from './fixed-clock';
import { SystemClock } from './system-clock';

describe('FixedClock', () => {
  it("renvoie l'instant donné, sans avancer", () => {
    const clock = new FixedClock('2026-10-25T00:30:00Z');

    expect(clock.now().toString()).toBe('2026-10-25T00:30:00Z');
    expect(clock.now().toString()).toBe('2026-10-25T00:30:00Z');
  });

  it("avance d'une durée donnée", () => {
    const clock = new FixedClock('2026-10-25T00:30:00Z');

    clock.advance({ hours: 2, minutes: 15 });

    expect(clock.now().toString()).toBe('2026-10-25T02:45:00Z');
  });

  it("garde l'instant UTC exact pendant la nuit du passage à l'heure d'hiver", () => {
    // Le 25 octobre 2026 à 3 h en Europe/Paris, on recule à 2 h : la nuit locale dure 9 h.
    const clock = new FixedClock('2026-10-24T20:00:00Z'); // 22 h à Paris
    clock.advance({ hours: 9 });

    const local = clock.now().toZonedDateTimeISO('Europe/Paris');

    expect(local.toPlainTime().toString()).toBe('06:00:00');
  });
});

describe('SystemClock', () => {
  it('donne l’instant à la milliseconde, la précision que stocke PostgreSQL', () => {
    const clock = new SystemClock();

    // Plusieurs lectures : une seule tomberait par hasard sur une milliseconde ronde une fois sur un million.
    for (let reading = 0; reading < 20; reading++) {
      expect(clock.now().epochNanoseconds % 1_000_000n).toBe(0n);
    }
  });
});

describe('ClockModule', () => {
  it("fournit l'horloge système sous le jeton CLOCK", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ClockModule] }).compile();

    expect(moduleRef.get<Clock>(CLOCK)).toBeInstanceOf(SystemClock);
  });

  it('se remplace par une FixedClock dans les tests', async () => {
    const fixed = new FixedClock('2026-01-01T00:00:00Z');
    const moduleRef = await Test.createTestingModule({ imports: [ClockModule] })
      .overrideProvider(CLOCK)
      .useValue(fixed)
      .compile();

    expect(moduleRef.get<Clock>(CLOCK).now().toString()).toBe('2026-01-01T00:00:00Z');
  });
});
