import { validateEnv } from '@trame/platform/config';
import { envSchema } from './env.schema';

const OIDC = {
  OIDC_ISSUER_URL: 'http://127.0.0.1:8080/realms/trame',
  OIDC_AUDIENCE: 'trame-api',
  OIDC_JWKS_URL: 'http://127.0.0.1:8080/realms/trame/protocol/openid-connect/certs',
};

describe("environnement de l'API", () => {
  it('applique les valeurs par défaut', () => {
    expect(
      validateEnv(envSchema, { DATABASE_URL: 'postgresql://localhost/trame', ...OIDC }),
    ).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://localhost/trame',
      ...OIDC,
    });
  });

  it('exige une URL PostgreSQL', () => {
    expect(() => validateEnv(envSchema, { ...OIDC })).toThrow(/DATABASE_URL/);
    expect(() =>
      validateEnv(envSchema, { DATABASE_URL: 'mysql://localhost/trame', ...OIDC }),
    ).toThrow(/DATABASE_URL/);
  });

  it("n'accepte qu'une adresse IP pour l'écoute", () => {
    const databaseUrl = 'postgresql://localhost/trame';

    expect(
      validateEnv(envSchema, { DATABASE_URL: databaseUrl, HOST: '0.0.0.0', ...OIDC }),
    ).toMatchObject({
      HOST: '0.0.0.0',
    });
    expect(() =>
      validateEnv(envSchema, { DATABASE_URL: databaseUrl, HOST: 'localhost', ...OIDC }),
    ).toThrow(/HOST/);
  });

  it('refuse de démarrer sans la configuration OIDC : aucune route métier ne serait vérifiable', () => {
    const databaseUrl = 'postgresql://localhost/trame';

    for (const missing of Object.keys(OIDC)) {
      const withoutOne: Record<string, string> = { DATABASE_URL: databaseUrl, ...OIDC };
      delete withoutOne[missing];
      expect(() => validateEnv(envSchema, withoutOne), missing).toThrow(new RegExp(missing));
    }
  });
});
