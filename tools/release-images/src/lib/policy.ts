/**
 * Politique de publication des images (US-005 B1, issue #44).
 *
 * Ces valeurs sont la source de confiance : elles ne sont jamais lues dans un fichier vérifié
 * ni dans un run, pour qu'un images.json falsifié ne puisse pas choisir ses propres critères.
 */
export const GITHUB_REPOSITORY = 'hachwilliam89-spec/trame';

export const IMAGE_NAMES = ['api', 'relay', 'migrator', 'web', 'engine', 'worker'] as const;

export type ImageName = (typeof IMAGE_NAMES)[number];

export const IMAGE_REPOSITORY_PREFIX = 'ghcr.io/hachwilliam89-spec/trame-';

/** Manifeste de version : sa présence, signée et vérifiée, marque une publication terminée. */
export const RELEASE_REPOSITORY = 'ghcr.io/hachwilliam89-spec/trame-release';

export const RELEASE_ARTIFACT_TYPE = 'application/vnd.trame.release.v1+json';

/** Identité du certificat Sigstore : le workflow de publication, sur main uniquement. */
export const SIGNER_IDENTITY = `https://github.com/${GITHUB_REPOSITORY}/.github/workflows/publish-images.yml@refs/heads/main`;

export const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

/** Checks à réussir sur le commit publié. Le check « CodeQL » n'existe pas sur un push vers main. */
export const REQUIRED_CHECKS = [
  'CI OK',
  'Analyse (actions)',
  'Analyse (javascript-typescript)',
  'Analyse (python)',
];

/** Une analyse traitée par catégorie doit exister pour le commit publié. */
export const CODE_SCANNING_CATEGORIES = [
  '/language:actions',
  '/language:javascript-typescript',
  '/language:python',
];

export const BLOCKING_ALERT_SEVERITIES = ['critical', 'high'];
