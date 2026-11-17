import { ConfigValidationError } from '@trame/platform/config';
import { LoadDemoUsageError, readLoadDemoCommand } from './load-demo-command';

const ORGANIZATION = '019a4ac0-0000-7000-8000-000000000001';
const ENV = { DATABASE_URL: 'postgresql://trame_api:secret@postgres:5432/trame' };

describe('commande de chargement du jeu de démonstration', () => {
  it('lit l’organisation et l’adresse de la base', () => {
    expect(readLoadDemoCommand(['--organization', ORGANIZATION], ENV)).toEqual({
      organizationId: ORGANIZATION,
      databaseUrl: ENV.DATABASE_URL,
    });
  });

  it.each([
    ['sans organisation', []],
    ['avec un identifiant qui n’est pas un UUID', ['--organization', 'acme']],
    ['avec une option inconnue', ['--organization', ORGANIZATION, '--force']],
    ['avec un argument en trop', ['--organization', ORGANIZATION, 'encore']],
  ])('refuse un appel %s, en rappelant l’usage', (_case, args) => {
    expect(() => readLoadDemoCommand(args, ENV)).toThrow(LoadDemoUsageError);
    expect(() => readLoadDemoCommand(args, ENV)).toThrow(
      'Usage : node load-demo.js --organization <UUID de l’organisation>',
    );
  });

  it('refuse de démarrer sans adresse PostgreSQL valide, sans l’afficher', () => {
    const invalid = { DATABASE_URL: 'mysql://root:secret@db/trame' };

    expect(() => readLoadDemoCommand(['--organization', ORGANIZATION], {})).toThrow(
      ConfigValidationError,
    );
    expect(() => readLoadDemoCommand(['--organization', ORGANIZATION], invalid)).not.toThrow(
      /secret/,
    );
    expect(() => readLoadDemoCommand(['--organization', ORGANIZATION], invalid)).toThrow(
      ConfigValidationError,
    );
  });
});
