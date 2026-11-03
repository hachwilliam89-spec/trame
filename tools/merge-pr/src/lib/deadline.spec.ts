import { FakeStopwatch } from '../testing/fake-stopwatch';
import { Deadline } from './deadline';

describe('Deadline', () => {
  it('rend le temps restant d’après le temps écoulé', () => {
    const stopwatch = new FakeStopwatch();
    const deadline = new Deadline(stopwatch, 60_000);

    stopwatch.advance(40_000);

    expect(deadline.remainingMilliseconds()).toBe(20_000);
    expect(deadline.isExpired()).toBe(false);
  });

  it('est atteinte quand tout le budget est écoulé, sans temps restant négatif', () => {
    const stopwatch = new FakeStopwatch();
    const deadline = new Deadline(stopwatch, 60_000);

    stopwatch.advance(80_000);

    expect(deadline.remainingMilliseconds()).toBe(0);
    expect(deadline.isExpired()).toBe(true);
  });
});
