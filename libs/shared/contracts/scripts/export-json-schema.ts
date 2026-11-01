/**
 * Exporte les contrats API ↔ moteur en un document JSON Schema.
 * Usage : tsx libs/shared/contracts/scripts/export-json-schema.ts <fichier de sortie>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { engineContractsJsonSchema } from '../src/engine-contracts';

const [output] = process.argv.slice(2);
if (!output) {
  console.error('Usage : export-json-schema.ts <fichier de sortie>');
  process.exit(1);
}

const target = resolve(output);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(engineContractsJsonSchema(), null, 2)}\n`);
console.log(`JSON Schema écrit dans ${target}`);
