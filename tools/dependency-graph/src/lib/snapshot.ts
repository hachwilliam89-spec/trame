import type { Manifest } from './manifest';

/** Contexte du job GitHub Actions qui produit l'instantané. */
export interface SnapshotContext {
  /** Commit analysé, et sa référence (`refs/heads/main`). */
  sha: string;
  ref: string;
  runId: string;
  /** Instant de l'analyse, en ISO 8601 UTC. */
  scannedAt: string;
}

/** Instantané du graphe de dépendances (API REST « dependency submission », version 0). */
export interface Snapshot {
  version: 0;
  sha: string;
  ref: string;
  job: { correlator: string; id: string };
  detector: { name: string; version: string; url: string };
  scanned: string;
  manifests: Record<string, Manifest>;
}

/**
 * Identifie la série d'instantanés : un nouvel instantané du même corrélateur, sur la même
 * référence, remplace le précédent dans le graphe.
 */
const CORRELATOR = 'trame-dependency-graph';

export function toSnapshot(manifests: Manifest[], context: SnapshotContext): Snapshot {
  const manifestsByName: Record<string, Manifest> = {};
  for (const manifest of manifests) {
    manifestsByName[manifest.name] = manifest;
  }

  return {
    version: 0,
    sha: context.sha,
    ref: context.ref,
    job: { correlator: CORRELATOR, id: context.runId },
    detector: {
      name: 'trame-dependency-graph',
      version: '1.0.0',
      url: 'https://github.com/hachwilliam89-spec/trame/tree/main/tools/dependency-graph',
    },
    scanned: context.scannedAt,
    manifests: manifestsByName,
  };
}

/**
 * Noms des manifestes sans aucune dépendance directe de production. Un manifeste vide signale un
 * SBOM mal produit (format changé, mauvais dossier) : mieux vaut échouer que soumettre un graphe vide.
 */
export function manifestsWithoutDirectRuntimeDependency(snapshot: Snapshot): string[] {
  const emptyManifests: string[] = [];
  for (const manifest of Object.values(snapshot.manifests)) {
    const dependencies = Object.values(manifest.resolved);
    const hasDirectRuntimeDependency = dependencies.some(
      (dependency) => dependency.relationship === 'direct' && dependency.scope === 'runtime',
    );
    if (!hasDirectRuntimeDependency) {
      emptyManifests.push(manifest.name);
    }
  }
  return emptyManifests;
}
