import type { Manifest } from './manifest';
import { manifestsWithoutDirectRuntimeDependency, toSnapshot } from './snapshot';

const context = {
  sha: '0123456789abcdef0123456789abcdef01234567',
  ref: 'refs/heads/main',
  runId: '42',
  scannedAt: '2026-11-02T13:00:00Z',
};

function manifestWith(
  name: string,
  relationship: 'direct' | 'indirect',
  scope: 'runtime' | 'development',
): Manifest {
  return {
    name,
    file: { source_location: name },
    resolved: {
      'pkg:npm/zod@4.6.7': {
        package_url: 'pkg:npm/zod@4.6.7',
        relationship,
        scope,
        dependencies: [],
      },
    },
  };
}

describe('toSnapshot', () => {
  it('produit un instantané de version 0, rattaché au commit et au job', () => {
    const snapshot = toSnapshot([manifestWith('pnpm-lock.yaml', 'direct', 'runtime')], context);

    expect(snapshot).toMatchObject({
      version: 0,
      sha: context.sha,
      ref: 'refs/heads/main',
      job: { correlator: 'trame-dependency-graph', id: '42' },
      scanned: '2026-11-02T13:00:00Z',
    });
    expect(Object.keys(snapshot.manifests)).toEqual(['pnpm-lock.yaml']);
  });
});

describe('manifestsWithoutDirectRuntimeDependency', () => {
  it('signale un manifeste sans dépendance directe de production', () => {
    const snapshot = toSnapshot(
      [
        manifestWith('pnpm-lock.yaml', 'direct', 'runtime'),
        manifestWith('apps/engine/uv.lock', 'direct', 'development'),
        manifestWith('autre.lock', 'indirect', 'runtime'),
      ],
      context,
    );

    expect(manifestsWithoutDirectRuntimeDependency(snapshot)).toEqual([
      'apps/engine/uv.lock',
      'autre.lock',
    ]);
  });
});
