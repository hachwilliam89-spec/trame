import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { engineContracts, engineContractsJsonSchema } from './engine-contracts';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

const contracts: [string, z.ZodType][] = Object.entries(engineContracts);

function fixtures(contract: string, kind: 'valid' | 'invalid'): [string, unknown][] {
  const dir = join(fixturesDir, contract, kind);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => [file, JSON.parse(readFileSync(join(dir, file), 'utf-8')) as unknown]);
}

describe('contrats API ↔ moteur', () => {
  it("s'exportent tous en JSON Schema, sans construction non représentable", () => {
    const document = engineContractsJsonSchema();

    expect(Object.keys(document['$defs'] as object).sort()).toEqual(
      contracts.map(([id]) => id).sort(),
    );
  });

  it.each(contracts.map(([id]) => id))('%s a des fixtures valides et invalides', (id) => {
    expect(fixtures(id, 'valid').length).toBeGreaterThan(0);
    expect(fixtures(id, 'invalid').length).toBeGreaterThan(0);
  });

  describe.each(contracts)('%s', (id, schema) => {
    it.each(fixtures(id, 'valid'))('accepte %s', (_file, message) => {
      expect(schema.safeParse(message).success).toBe(true);
    });

    it.each(fixtures(id, 'invalid'))('refuse %s', (_file, message) => {
      expect(schema.safeParse(message).success).toBe(false);
    });
  });
});
