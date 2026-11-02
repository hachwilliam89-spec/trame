import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { ConfigModule } from './config.module';
import { ConfigValidationError, validateEnv } from './validate-env';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
});
type Env = z.output<typeof envSchema>;

describe('validateEnv', () => {
  it('renvoie la configuration typée, avec conversions et valeurs par défaut', () => {
    expect(validateEnv(envSchema, { DATABASE_URL: 'postgresql://localhost/trame' })).toEqual({
      PORT: 3000,
      DATABASE_URL: 'postgresql://localhost/trame',
    });
    expect(validateEnv(envSchema, { PORT: '8080', DATABASE_URL: 'postgresql://h/db' }).PORT).toBe(
      8080,
    );
  });

  it('bloque le démarrage et nomme chaque variable fautive', () => {
    expect(() => validateEnv(envSchema, { PORT: '0' })).toThrow(ConfigValidationError);
    expect(() => validateEnv(envSchema, { PORT: '0' })).toThrow(/PORT[\s\S]*DATABASE_URL/);
  });
});

describe('ConfigModule', () => {
  // Isolation : Nx injecte le `.env` de la racine dans chaque tâche.
  beforeEach(() => {
    vi.stubEnv('PORT', undefined);
    vi.stubEnv('DATABASE_URL', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('expose la configuration validée via ConfigService', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/trame');

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ schema: envSchema })],
    }).compile();
    const config = moduleRef.get<ConfigService<Env, true>>(ConfigService);

    expect(config.get('PORT', { infer: true })).toBe(3000);
    expect(config.get('DATABASE_URL', { infer: true })).toBe('postgresql://localhost:5432/trame');
  });

  it("refuse de compiler le module quand l'environnement est invalide", async () => {
    await expect(async () =>
      Test.createTestingModule({
        imports: [ConfigModule.forRoot({ schema: envSchema })],
      }).compile(),
    ).rejects.toThrow(ConfigValidationError);
  });
});
