import { transportSettings } from './settings';
it('exige des destinations explicites et refuse les protocoles inattendus', () => {
  expect(transportSettings.safeParse({}).success).toBe(false);
  expect(
    transportSettings.safeParse({
      DATABASE_URL: 'postgresql://db:5432/trame',
      AMQP_URL: 'https://broker',
    }).success,
  ).toBe(false);
  expect(
    transportSettings.parse({
      DATABASE_URL: 'postgresql://db:5432/trame',
      AMQP_URL: 'amqp://broker',
    }).LOG_LEVEL,
  ).toBe('info');
});
