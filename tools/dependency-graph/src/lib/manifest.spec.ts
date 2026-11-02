import type { CycloneDxBom } from './cyclonedx';
import { toManifest } from './manifest';

/** Comme `uv export` : les `bom-ref` ne sont pas des `purl`. */
const fullBom: CycloneDxBom = {
  metadata: { component: { 'bom-ref': 'engine-1@0.0.0' } },
  components: [
    { 'bom-ref': 'fastapi-2@0.162.0', purl: 'pkg:pypi/fastapi@0.162.0' },
    { 'bom-ref': 'starlette-3@1.0.0', purl: 'pkg:pypi/starlette@1.0.0' },
    { 'bom-ref': 'pytest-4@9.2.0', purl: 'pkg:pypi/pytest@9.2.0' },
    { 'bom-ref': 'local-5@0.0.0' },
  ],
  dependencies: [
    { ref: 'engine-1@0.0.0', dependsOn: ['fastapi-2@0.162.0', 'pytest-4@9.2.0'] },
    { ref: 'fastapi-2@0.162.0', dependsOn: ['starlette-3@1.0.0', 'local-5@0.0.0'] },
  ],
};

const productionBom: CycloneDxBom = {
  metadata: { component: { 'bom-ref': 'engine-1@0.0.0' } },
  components: [
    { 'bom-ref': 'fastapi-2@0.162.0', purl: 'pkg:pypi/fastapi@0.162.0' },
    { 'bom-ref': 'starlette-3@1.0.0', purl: 'pkg:pypi/starlette@1.0.0' },
  ],
};

describe('toManifest', () => {
  const manifest = toManifest('apps/engine/uv.lock', fullBom, productionBom);

  it('nomme le manifeste par son fichier de verrouillage', () => {
    expect(manifest.name).toBe('apps/engine/uv.lock');
    expect(manifest.file).toEqual({ source_location: 'apps/engine/uv.lock' });
  });

  it('distingue les dépendances directes, celles du projet lui-même', () => {
    expect(manifest.resolved['pkg:pypi/fastapi@0.162.0']?.relationship).toBe('direct');
    expect(manifest.resolved['pkg:pypi/pytest@9.2.0']?.relationship).toBe('direct');
    expect(manifest.resolved['pkg:pypi/starlette@1.0.0']?.relationship).toBe('indirect');
  });

  it('classe en développement un paquet absent du SBOM de production', () => {
    expect(manifest.resolved['pkg:pypi/fastapi@0.162.0']?.scope).toBe('runtime');
    expect(manifest.resolved['pkg:pypi/starlette@1.0.0']?.scope).toBe('runtime');
    expect(manifest.resolved['pkg:pypi/pytest@9.2.0']?.scope).toBe('development');
  });

  it('relie chaque paquet à ses dépendances par purl, en ignorant les composants sans purl', () => {
    expect(manifest.resolved['pkg:pypi/fastapi@0.162.0']?.dependencies).toEqual([
      'pkg:pypi/starlette@1.0.0',
    ]);
    expect(Object.keys(manifest.resolved)).toHaveLength(3);
  });
});
