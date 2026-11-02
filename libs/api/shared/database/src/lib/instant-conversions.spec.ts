import { dateToInstant, instantToDate } from './instant-conversions';

describe('conversions Instant ↔ Date', () => {
  it("conserve l'instant à la milliseconde", () => {
    const instant = Temporal.Instant.from('2026-10-25T01:30:00.123Z');

    expect(dateToInstant(instantToDate(instant)).equals(instant)).toBe(true);
    expect(instantToDate(instant).toISOString()).toBe('2026-10-25T01:30:00.123Z');
  });
});
