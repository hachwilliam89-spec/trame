import { USAGE, parseArguments } from './arguments';

describe('parseArguments', () => {
  it('lit le numéro de la PR, avec un délai de 30 minutes par défaut', () => {
    expect(parseArguments(['22'])).toEqual({ number: 22, timeoutMinutes: 30 });
  });

  it('lit un délai donné en minutes', () => {
    expect(parseArguments(['22', '--timeout', '45'])).toEqual({ number: 22, timeoutMinutes: 45 });
  });

  it.each([
    [[]],
    [['abc']],
    [['0']],
    [['22', '--timeout']],
    [['22', '--timeout', '-5']],
    [['22', '--admin']],
  ])('refuse des arguments invalides (%o)', (args) => {
    expect(() => parseArguments(args)).toThrow(USAGE);
  });
});
