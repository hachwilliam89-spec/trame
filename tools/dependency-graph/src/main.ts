/**
 * Construit l'instantané du graphe de dépendances à partir des SBOM CycloneDX de pnpm et de uv.
 *
 * Le graphe de GitHub ne lit ni le `pnpm-lock.yaml` de pnpm 12, écrit en deux documents YAML quand
 * la version de pnpm est figée, ni `uv.lock`. L'instantané lui est donc soumis par l'API.
 *
 * Usage : tsx tools/dependency-graph/src/main.ts <dossier des SBOM> <fichier de sortie>
 * Variables : GITHUB_SHA, GITHUB_REF, GITHUB_RUN_ID, SCANNED_AT.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CycloneDxBom } from './lib/cyclonedx';
import { type Manifest, toManifest } from './lib/manifest';
import {
  type SnapshotContext,
  manifestsWithoutDirectRuntimeDependency,
  toSnapshot,
} from './lib/snapshot';

/** Fichiers de verrouillage, et préfixe de leurs SBOM : `<préfixe>-full.json`, `<préfixe>-production.json`. */
const LOCKFILES = [
  { path: 'pnpm-lock.yaml', sbomPrefix: 'pnpm' },
  { path: 'apps/engine/uv.lock', sbomPrefix: 'uv' },
];

function readBom(path: string): CycloneDxBom {
  return JSON.parse(readFileSync(path, 'utf8')) as CycloneDxBom;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

function main(): void {
  const [sbomDirectory, outputPath] = process.argv.slice(2);
  if (sbomDirectory === undefined || outputPath === undefined) {
    throw new Error('Usage : main.ts <dossier des SBOM> <fichier de sortie>');
  }

  const manifests: Manifest[] = [];
  for (const lockfile of LOCKFILES) {
    const fullBom = readBom(join(sbomDirectory, `${lockfile.sbomPrefix}-full.json`));
    const productionBom = readBom(join(sbomDirectory, `${lockfile.sbomPrefix}-production.json`));
    manifests.push(toManifest(lockfile.path, fullBom, productionBom));
  }

  const context: SnapshotContext = {
    sha: requiredEnv('GITHUB_SHA'),
    ref: requiredEnv('GITHUB_REF'),
    runId: requiredEnv('GITHUB_RUN_ID'),
    scannedAt: requiredEnv('SCANNED_AT'),
  };
  const snapshot = toSnapshot(manifests, context);

  const emptyManifests = manifestsWithoutDirectRuntimeDependency(snapshot);
  if (emptyManifests.length > 0) {
    throw new Error(`Aucune dépendance directe de production dans : ${emptyManifests.join(', ')}`);
  }

  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

main();
