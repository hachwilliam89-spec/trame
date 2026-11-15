import type { CoverageNeed } from './coverage-need';
import { WeeklyCoverage, type WeeklyCoverageProperties } from './weekly-coverage';
import {
  DuplicateCoverageNeedError,
  InvalidRequiredCountError,
  InvalidWeekStartError,
  NeedOutsideWeekError,
} from './weekly-coverage.errors';

const MORNING = '0190f0a0-0000-7000-8000-0000000000a1';
const AFTERNOON = '0190f0a0-0000-7000-8000-0000000000a2';
const FORKLIFT_DRIVER = '0190f0a0-0000-7000-8000-0000000000b1';
const ORDER_PICKER = '0190f0a0-0000-7000-8000-0000000000b2';

function need(date: string, overrides: Partial<CoverageNeed> = {}): CoverageNeed {
  return {
    date: Temporal.PlainDate.from(date),
    shiftTemplateId: MORNING,
    positionId: FORKLIFT_DRIVER,
    requiredCount: 2,
    ...overrides,
  };
}

function coverageProperties(
  overrides: Partial<WeeklyCoverageProperties> = {},
): WeeklyCoverageProperties {
  return {
    organizationId: '0190f0a0-0000-7000-8000-00000000000a',
    siteId: '0190f0a0-0000-7000-8000-0000000000d1',
    // Lundi 16 novembre 2026.
    weekStartsOn: Temporal.PlainDate.from('2026-11-16'),
    needs: [],
    updatedAt: Temporal.Instant.from('2026-11-15T08:00:00Z'),
    ...overrides,
  };
}

function describeNeed(coverageNeed: CoverageNeed): string {
  return `${coverageNeed.date.toString()} ${coverageNeed.shiftTemplateId} ${coverageNeed.positionId} ${coverageNeed.requiredCount}`;
}

describe('WeeklyCoverage', () => {
  it('garde les besoins de la semaine, triés par jour, créneau et poste', () => {
    const coverage = WeeklyCoverage.create(
      coverageProperties({
        needs: [
          need('2026-11-17', { requiredCount: 1 }),
          need('2026-11-16', { shiftTemplateId: AFTERNOON, requiredCount: 3 }),
          need('2026-11-16', { positionId: ORDER_PICKER, requiredCount: 4 }),
          need('2026-11-16'),
        ],
      }),
    );

    expect(coverage.needs.map(describeNeed)).toEqual([
      `2026-11-16 ${MORNING} ${FORKLIFT_DRIVER} 2`,
      `2026-11-16 ${MORNING} ${ORDER_PICKER} 4`,
      `2026-11-16 ${AFTERNOON} ${FORKLIFT_DRIVER} 3`,
      `2026-11-17 ${MORNING} ${FORKLIFT_DRIVER} 1`,
    ]);
  });

  it('accepte une semaine sans besoin', () => {
    expect(WeeklyCoverage.create(coverageProperties()).needs).toEqual([]);
  });

  it.each([
    ['un mardi', '2026-11-17'],
    ['un dimanche', '2026-11-15'],
  ])('refuse une semaine qui commence %s', (_case, weekStartsOn) => {
    const properties = coverageProperties({ weekStartsOn: Temporal.PlainDate.from(weekStartsOn) });

    expect(() => WeeklyCoverage.create(properties)).toThrow(InvalidWeekStartError);
  });

  it.each([
    ['le dimanche qui précède la semaine', '2026-11-15'],
    ['le lundi qui la suit', '2026-11-23'],
  ])('refuse un besoin %s', (_case, date) => {
    const properties = coverageProperties({ needs: [need(date)] });

    expect(() => WeeklyCoverage.create(properties)).toThrow(NeedOutsideWeekError);
  });

  it('accepte un besoin le dimanche, dernier jour de la semaine', () => {
    const properties = coverageProperties({ needs: [need('2026-11-22')] });

    expect(() => WeeklyCoverage.create(properties)).not.toThrow();
  });

  it('suit le calendrier quand la semaine passe d’une année à l’autre', () => {
    const properties = coverageProperties({
      weekStartsOn: Temporal.PlainDate.from('2026-12-28'),
      needs: [need('2027-01-03')],
    });

    expect(() => WeeklyCoverage.create(properties)).not.toThrow();
  });

  it.each([0, -1, 1.5, 1000])('refuse %j personnes requises', (requiredCount) => {
    const properties = coverageProperties({ needs: [need('2026-11-16', { requiredCount })] });

    expect(() => WeeklyCoverage.create(properties)).toThrow(InvalidRequiredCountError);
  });

  it.each([1, 999])('accepte %j personnes requises', (requiredCount) => {
    const properties = coverageProperties({ needs: [need('2026-11-16', { requiredCount })] });

    expect(() => WeeklyCoverage.create(properties)).not.toThrow();
  });

  it('refuse deux besoins pour le même jour, le même créneau et le même poste, même avec des UUID de casses différentes', () => {
    const properties = coverageProperties({
      needs: [
        need('2026-11-16'),
        need('2026-11-16', { shiftTemplateId: MORNING.toUpperCase(), requiredCount: 5 }),
      ],
    });

    expect(() => WeeklyCoverage.create(properties)).toThrow(DuplicateCoverageNeedError);
  });

  it('ne laisse pas modifier ses besoins après sa création', () => {
    const coverage = WeeklyCoverage.create(coverageProperties({ needs: [need('2026-11-16')] }));

    expect(Object.isFrozen(coverage.needs)).toBe(true);
  });
});
