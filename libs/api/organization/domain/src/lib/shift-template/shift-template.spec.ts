import { TimeZone } from '../site/time-zone';
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

function shiftTemplate(overrides: Partial<ShiftTemplateProperties> = {}): ShiftTemplate {
  return ShiftTemplate.create({
    id: '00000000-0000-7000-8000-000000000001',
    organizationId: 'org-a',
    siteId: '00000000-0000-7000-8000-0000000000aa',
    label: 'Nuit',
    start: time('22:00'),
    end: time('06:00'),
    break: ShiftBreak.of(time('02:00'), 30),
    createdAt: Temporal.Instant.from('2026-11-02T08:00:00Z'),
    ...overrides,
  });
}

describe('ShiftTemplate', () => {
  describe('création', () => {
    it('détecte un créneau qui traverse minuit', () => {
      expect(shiftTemplate().crossesMidnight).toBe(true);
      expect(
        shiftTemplate({ start: time('06:00'), end: time('14:00'), break: null }).crossesMidnight,
      ).toBe(false);
    });

    it('accepte un créneau sans pause', () => {
      expect(shiftTemplate({ break: null }).break).toBeNull();
    });

    it('refuse un libellé vide', () => {
      expect(() => shiftTemplate({ label: ' ' })).toThrow(BlankShiftTemplateLabelError);
    });

    it("refuse un créneau qui finit à l'heure où il commence", () => {
      expect(() =>
        shiftTemplate({ start: time('08:00'), end: time('08:00'), break: null }),
      ).toThrow(EmptyShiftError);
    });

    it.each([
      ['avant le début', '21:00', 30],
      ['après la fin', '07:00', 30],
      ['qui déborde de la fin', '05:45', 30],
    ])('refuse une pause %s', (_case, breakStart, breakMinutes) => {
      expect(() => shiftTemplate({ break: ShiftBreak.of(time(breakStart), breakMinutes) })).toThrow(
        BreakOutsideShiftError,
      );
    });

    it('accepte une pause collée au début ou à la fin du créneau', () => {
      expect(() => shiftTemplate({ break: ShiftBreak.of(time('22:00'), 30) })).not.toThrow();
      expect(() => shiftTemplate({ break: ShiftBreak.of(time('05:30'), 30) })).not.toThrow();
    });

    it.each([0, -10, 12.5])('refuse une pause de %j minutes', (minutes) => {
      expect(() => ShiftBreak.of(time('02:00'), minutes)).toThrow(InvalidBreakDurationError);
    });

    it('refuse une heure avec des secondes, plutôt que de les perdre', () => {
      expect(() => shiftTemplate({ start: time('22:00:30') })).toThrow(RangeError);
    });
  });

  describe('durées', () => {
    it('un jour ordinaire, la nuit 22 h–6 h dure 8 h, dont 7 h 30 de temps effectif', () => {
      const durations = shiftTemplate().durationsOn(date('2026-11-10'), paris);

      expect(durations).toEqual({
        startsAt: Temporal.Instant.from('2026-11-10T21:00:00Z'),
        endsAt: Temporal.Instant.from('2026-11-11T05:00:00Z'),
        amplitudeMinutes: 480,
        effectiveMinutes: 450,
      });
    });

    // Scénario : Créneau de nuit au changement d'heure (US-030).
    // Le 25 octobre 2026 à 3 h, Paris passe de UTC+2 à UTC+1.
    it("la nuit du passage à l'heure d'hiver, l'amplitude vaut 9 h et le temps effectif 8 h 30", () => {
      const durations = shiftTemplate().durationsOn(date('2026-10-24'), paris);

      expect(durations.amplitudeMinutes).toBe(9 * 60);
      expect(durations.effectiveMinutes).toBe(8 * 60 + 30);
      expect(durations.startsAt.toString()).toBe('2026-10-24T20:00:00Z');
      expect(durations.endsAt.toString()).toBe('2026-10-25T05:00:00Z');
    });

    // Le 29 mars 2026 à 2 h, Paris passe de UTC+1 à UTC+2.
    it("la nuit du passage à l'heure d'été, l'amplitude vaut 7 h et le temps effectif 6 h 30", () => {
      const durations = shiftTemplate().durationsOn(date('2026-03-28'), paris);

      expect(durations.amplitudeMinutes).toBe(7 * 60);
      expect(durations.effectiveMinutes).toBe(6 * 60 + 30);
    });

    it("un créneau de jour, après le changement d'heure, garde sa durée", () => {
      const morning = shiftTemplate({ start: time('06:00'), end: time('14:00'), break: null });

      expect(morning.durationsOn(date('2026-10-25'), paris).amplitudeMinutes).toBe(8 * 60);
    });

    it("un créneau logé dans l'heure sautée dure 0, sans temps effectif négatif", () => {
      const skipped = shiftTemplate({
        start: time('02:00'),
        end: time('03:00'),
        break: ShiftBreak.of(time('02:00'), 15),
      });

      const durations = skipped.durationsOn(date('2026-03-29'), paris);

      expect(durations.amplitudeMinutes).toBe(0);
      expect(durations.effectiveMinutes).toBe(0);
    });

    it('calcule dans le fuseau du site', () => {
      const durations = shiftTemplate().durationsOn(
        date('2026-11-10'),
        TimeZone.of('America/New_York'),
      );

      expect(durations.startsAt.toString()).toBe('2026-11-11T03:00:00Z');
    });
  });
});
