import { TimeZone } from '../site/time-zone';
import { wallClockMinutesBetween } from './local-time';
import { ShiftBreak } from './shift-break';
import { ShiftTemplate, type ShiftTemplateProperties } from './shift-template';
import {
  BlankShiftTemplateLabelError,
  BreakOutsideShiftError,
  EmptyShiftError,
  InvalidBreakDurationError,
} from './shift-template.errors';

const paris = TimeZone.of('Europe/Paris');
const time = (text: string): Temporal.PlainTime => Temporal.PlainTime.from(text);
const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);
const instant = (text: string): Temporal.Instant => Temporal.Instant.from(text);

// Nuits de changement d'heure à Paris en 2026.
// Le 29 mars à 2 h, l'horloge saute à 3 h (UTC+1 → UTC+2) : l'heure de 2 h à 3 h n'existe pas.
// Le 25 octobre à 3 h, l'horloge revient à 2 h (UTC+2 → UTC+1) : l'heure de 2 h à 3 h se répète.
const SUMMER_TIME_DAY = '2026-03-29';
const WINTER_TIME_DAY = '2026-10-25';

function shiftTemplate(overrides: Partial<ShiftTemplateProperties> = {}): ShiftTemplate {
  return ShiftTemplate.create({
    id: '00000000-0000-7000-8000-000000000001',
    organizationId: 'org-a',
    siteId: '00000000-0000-7000-8000-0000000000aa',
    label: 'Nuit',
    start: time('22:00'),
    end: time('06:00'),
    break: ShiftBreak.of(time('02:00'), 30),
    createdAt: instant('2026-11-02T08:00:00Z'),
    ...overrides,
  });
}

function shiftFrom(
  start: string,
  end: string,
  breakStart: string,
  breakMinutes: number,
): ShiftTemplate {
  return shiftTemplate({
    start: time(start),
    end: time(end),
    break: ShiftBreak.of(time(breakStart), breakMinutes),
  });
}

describe('ShiftTemplate', () => {
  describe('création', () => {
    it('détecte un créneau qui traverse minuit', () => {
      expect(shiftTemplate().crossesMidnight).toBe(true);
      expect(shiftFrom('06:00', '14:00', '10:00', 20).crossesMidnight).toBe(false);
    });

    it('refuse un libellé vide', () => {
      expect(() => shiftTemplate({ label: ' ' })).toThrow(BlankShiftTemplateLabelError);
    });

    it("refuse un créneau qui finit à l'heure où il commence", () => {
      expect(() => shiftFrom('08:00', '08:00', '08:00', 15)).toThrow(EmptyShiftError);
    });

    it.each([
      ['avant le début', '21:00', 30],
      ['après la fin', '07:00', 30],
      ['qui déborde de la fin', '05:45', 30],
    ])('refuse une pause %s', (_case, breakStart, breakMinutes) => {
      expect(() => shiftFrom('22:00', '06:00', breakStart, breakMinutes)).toThrow(
        BreakOutsideShiftError,
      );
    });

    it('accepte une pause collée au début ou à la fin du créneau', () => {
      expect(() => shiftFrom('22:00', '06:00', '22:00', 30)).not.toThrow();
      expect(() => shiftFrom('22:00', '06:00', '05:30', 30)).not.toThrow();
    });

    it.each([0, -10, 12.5])('refuse une pause de %j minutes', (minutes) => {
      expect(() => ShiftBreak.of(time('02:00'), minutes)).toThrow(InvalidBreakDurationError);
    });

    it('refuse une heure avec des secondes, plutôt que de les perdre', () => {
      expect(() => shiftTemplate({ start: time('22:00:30') })).toThrow(RangeError);
    });
  });

  describe('durées un jour ordinaire', () => {
    it('la nuit 22 h–6 h dure 8 h, dont 7 h 30 de temps effectif', () => {
      expect(shiftTemplate().durationsOn(date('2026-11-10'), paris)).toEqual({
        startsAt: instant('2026-11-10T21:00:00Z'),
        endsAt: instant('2026-11-11T05:00:00Z'),
        amplitudeMinutes: 480,
        breakMinutes: 30,
        effectiveMinutes: 450,
      });
    });

    it('calcule dans le fuseau du site', () => {
      const durations = shiftTemplate().durationsOn(
        date('2026-11-10'),
        TimeZone.of('America/New_York'),
      );

      expect(durations.startsAt.toString()).toBe('2026-11-11T03:00:00Z');
    });
  });

  describe("durées au passage à l'heure d'hiver (heure répétée)", () => {
    // Scénario : Créneau de nuit au changement d'heure (US-030).
    it("la nuit 22 h–6 h : l'amplitude vaut 9 h et le temps effectif 8 h 30", () => {
      const durations = shiftTemplate().durationsOn(date('2026-10-24'), paris);

      expect(durations.amplitudeMinutes).toBe(9 * 60);
      expect(durations.effectiveMinutes).toBe(8 * 60 + 30);
      expect(durations.startsAt.toString()).toBe('2026-10-24T20:00:00Z');
      expect(durations.endsAt.toString()).toBe('2026-10-25T05:00:00Z');
    });

    it('une heure répétée désigne sa première occurrence : 2 h 30–3 h 30 dure 2 h', () => {
      const durations = shiftFrom('02:30', '03:30', '03:00', 15).durationsOn(
        date(WINTER_TIME_DAY),
        paris,
      );

      expect(durations.startsAt.toString()).toBe('2026-10-25T00:30:00Z');
      expect(durations.endsAt.toString()).toBe('2026-10-25T02:30:00Z');
      expect(durations.amplitudeMinutes).toBe(120);
      expect(durations.effectiveMinutes).toBe(105);
    });

    it('un créneau de jour, après le changement, garde sa durée', () => {
      const morning = shiftFrom('06:00', '14:00', '10:00', 20);

      expect(morning.durationsOn(date(WINTER_TIME_DAY), paris).amplitudeMinutes).toBe(8 * 60);
    });
  });

  describe("durées au passage à l'heure d'été (heure sautée)", () => {
    it("la nuit 22 h–6 h : l'amplitude vaut 7 h et le temps effectif 6 h 30", () => {
      const durations = shiftTemplate().durationsOn(date('2026-03-28'), paris);

      expect(durations.amplitudeMinutes).toBe(7 * 60);
      expect(durations.effectiveMinutes).toBe(6 * 60 + 30);
    });

    it("un début dans l'heure sautée commence au saut : 2 h 45–3 h 30 dure 30 min, pas −15", () => {
      const durations = shiftFrom('02:45', '03:30', '03:00', 15).durationsOn(
        date(SUMMER_TIME_DAY),
        paris,
      );

      expect(durations.startsAt.toString()).toBe('2026-03-29T01:00:00Z');
      expect(durations.endsAt.toString()).toBe('2026-03-29T01:30:00Z');
      expect(durations.amplitudeMinutes).toBe(30);
      expect(durations.effectiveMinutes).toBe(15);
    });

    it('une fin dans l’heure sautée finit au saut : 22 h–2 h 30 dure 4 h', () => {
      const durations = shiftFrom('22:00', '02:30', '00:00', 30).durationsOn(
        date('2026-03-28'),
        paris,
      );

      expect(durations.endsAt.toString()).toBe('2026-03-29T01:00:00Z');
      expect(durations.amplitudeMinutes).toBe(240);
      expect(durations.effectiveMinutes).toBe(210);
    });

    it("un créneau logé dans l'heure sautée dure 0, sans pause retranchée", () => {
      const durations = shiftFrom('02:00', '03:00', '02:00', 15).durationsOn(
        date(SUMMER_TIME_DAY),
        paris,
      );

      expect(durations).toMatchObject({
        amplitudeMinutes: 0,
        breakMinutes: 0,
        effectiveMinutes: 0,
      });
    });

    it('une pause repoussée après la fin par le saut ne retranche rien', () => {
      // 1 h 30–2 h 50 avec une pause à 2 h 10 : la fin et la pause tombent toutes deux au saut.
      const durations = shiftFrom('01:30', '02:50', '02:10', 30).durationsOn(
        date(SUMMER_TIME_DAY),
        paris,
      );

      expect(durations).toMatchObject({
        amplitudeMinutes: 30,
        breakMinutes: 0,
        effectiveMinutes: 30,
      });
    });

    it('une pause coupée par la fin du créneau ne retranche que sa partie dans le créneau', () => {
      // 1 h–3 h 15 avec une pause à 2 h 30 : elle commence au saut (3 h) et le créneau finit à 3 h 15.
      const durations = shiftFrom('01:00', '03:15', '02:30', 30).durationsOn(
        date(SUMMER_TIME_DAY),
        paris,
      );

      expect(durations).toMatchObject({
        amplitudeMinutes: 75,
        breakMinutes: 15,
        effectiveMinutes: 60,
      });
    });
  });

  describe('invariants sur les deux nuits de changement d’heure', () => {
    // Tous les créneaux à la demi-heure, avec une pause de 15 min à leur début.
    const halfHours: string[] = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
      halfHours.push(
        Temporal.PlainTime.from({
          hour: Math.floor(minutes / 60),
          minute: minutes % 60,
        }).toString(),
      );
    }

    it.each([
      ['heure sautée', '2026-03-28'],
      ['heure sautée', SUMMER_TIME_DAY],
      ['heure répétée', '2026-10-24'],
      ['heure répétée', WINTER_TIME_DAY],
    ])(
      '%s, créneaux commencés le %s : durées jamais négatives, écart réel d’une heure au plus',
      (_case, day) => {
        for (const start of halfHours) {
          for (const end of halfHours) {
            if (start === end) {
              continue;
            }
            const shift = shiftFrom(start, end, start, 15);
            const durations = shift.durationsOn(date(day), paris);
            const wallClockMinutes = wallClockMinutesBetween(time(start), time(end));

            expect(durations.amplitudeMinutes).toBeGreaterThanOrEqual(0);
            expect(durations.breakMinutes).toBeGreaterThanOrEqual(0);
            expect(durations.breakMinutes).toBeLessThanOrEqual(15);
            expect(durations.effectiveMinutes).toBeGreaterThanOrEqual(0);
            expect(durations.effectiveMinutes).toBeLessThanOrEqual(durations.amplitudeMinutes);
            expect(Math.abs(durations.amplitudeMinutes - wallClockMinutes)).toBeLessThanOrEqual(60);
          }
        }
      },
    );
  });
});
