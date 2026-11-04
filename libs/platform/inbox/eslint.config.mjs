import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Seul adaptateur autorisé à lire l'heure réelle (ADR-0019).
    files: ['src/lib/system-inbox.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
