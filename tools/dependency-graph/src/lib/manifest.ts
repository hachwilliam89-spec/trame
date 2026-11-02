import type { CycloneDxBom } from './cyclonedx';

/** Dépendance résolue, au format de l'API de soumission du graphe de dépendances de GitHub. */
export interface ResolvedDependency {
  package_url: string;
  relationship: 'direct' | 'indirect';
  scope: 'runtime' | 'development';
  /** Dépendances de ce paquet, par `package_url`. */
  dependencies: string[];
}

/** Manifeste d'un instantané : les dépendances résolues d'un fichier de verrouillage. */
export interface Manifest {
  name: string;
  file: { source_location: string };
  resolved: Record<string, ResolvedDependency>;
}

/**
 * Construit le manifeste d'un fichier de verrouillage à partir de deux SBOM CycloneDX :
 * - `fullBom` : toutes les dépendances, et le graphe de qui dépend de qui ;
 * - `productionBom` : les seules dépendances de production. Un paquet absent de ce second SBOM
 *   n'est utilisé qu'en développement.
 * Une dépendance directe est une dépendance du projet lui-même (`metadata.component`).
 */
export function toManifest(
  lockfilePath: string,
  fullBom: CycloneDxBom,
  productionBom: CycloneDxBom,
): Manifest {
  const packageUrlByRef = packageUrlsByRef(fullBom);
  const dependsOnByRef = dependsOnByRefOf(fullBom);
  const productionPackageUrls = new Set(packageUrlsByRef(productionBom).values());
  const directRefs = new Set(dependsOnByRef.get(fullBom.metadata.component['bom-ref']) ?? []);

  const resolved: Record<string, ResolvedDependency> = {};
  for (const [ref, packageUrl] of packageUrlByRef) {
    resolved[packageUrl] = {
      package_url: packageUrl,
      relationship: directRefs.has(ref) ? 'direct' : 'indirect',
      scope: productionPackageUrls.has(packageUrl) ? 'runtime' : 'development',
      dependencies: packageUrlsOf(dependsOnByRef.get(ref) ?? [], packageUrlByRef),
    };
  }

  return { name: lockfilePath, file: { source_location: lockfilePath }, resolved };
}

/** `bom-ref` → `purl`, pour les composants qui ont un `purl`. */
function packageUrlsByRef(bom: CycloneDxBom): Map<string, string> {
  const packageUrlByRef = new Map<string, string>();
  for (const component of bom.components) {
    if (component.purl !== undefined) {
      packageUrlByRef.set(component['bom-ref'], component.purl);
    }
  }
  return packageUrlByRef;
}

function dependsOnByRefOf(bom: CycloneDxBom): Map<string, string[]> {
  const dependsOnByRef = new Map<string, string[]>();
  for (const dependency of bom.dependencies ?? []) {
    dependsOnByRef.set(dependency.ref, dependency.dependsOn ?? []);
  }
  return dependsOnByRef;
}

function packageUrlsOf(refs: string[], packageUrlByRef: Map<string, string>): string[] {
  const packageUrls: string[] = [];
  for (const ref of refs) {
    const packageUrl = packageUrlByRef.get(ref);
    if (packageUrl !== undefined) {
      packageUrls.push(packageUrl);
    }
  }
  return packageUrls;
}
