import { totpCode } from './lib/totp';

// Secret de l'annexe B de la RFC 6238 (« 12345678901234567890 » en ASCII), encodé en base 32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totpCode', () => {
  it.each([
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
  ])('rend le code de la RFC 6238 à %i s', (unixSeconds, expected) => {
    expect(totpCode(RFC_SECRET, unixSeconds, 8)).toBe(expected);
  });

  it('accepte le secret tel que Keycloak l’affiche : groupes séparés par des espaces, minuscules', () => {
    expect(totpCode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', 59)).toBe('287082');
  });

  it('refuse un secret qui n’est pas en base 32', () => {
    expect(() => totpCode('pas du base32 !', 59)).toThrow('Secret TOTP invalide');
  });
});
