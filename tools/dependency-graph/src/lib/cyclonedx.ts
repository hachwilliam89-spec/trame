/**
 * Champs d'un SBOM CycloneDX (1.5 à 1.7) dont on a besoin. `pnpm sbom` et `uv export` produisent
 * ce format ; le reste du document est ignoré.
 */
export interface CycloneDxBom {
  metadata: {
    /** Le projet lui-même : ses dépendances directes sont celles qui en partent. */
    component: { 'bom-ref': string };
  };
  components: CycloneDxComponent[];
  dependencies?: CycloneDxDependency[];
}

export interface CycloneDxComponent {
  'bom-ref': string;
  /** Identifiant universel du paquet : `pkg:npm/zod@4.6.7`, `pkg:pypi/fastapi@0.162.0`. */
  purl?: string;
}

export interface CycloneDxDependency {
  ref: string;
  dependsOn?: string[];
}
