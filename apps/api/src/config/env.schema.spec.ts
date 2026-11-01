import { validateEnv } from '@trame/platform/config';
import { envSchema } from './env.schema';

describe("environnement de l'API", () => {
  it('applique les valeurs par défaut', () => {
    expect(validateEnv(envSchema, { DATABASE_URL: 'postgresql://localhost/trame' })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://localhost/trame',
    });
  });

  it('exige une URL PostgreSQL', () => {
    expect(() => validateEnv(envSchema, {})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv(envSchema, { DATABASE_URL: 'mysql://localhost/trame' })).toThrow(
      /DATABASE_URL/,
    );
  });
});
