import nx from '@nx/eslint-plugin';

/**
 * Lecture de l'heure courante interdite hors de l'adaptateur d'horloge (ADR-0019).
 * Le code reçoit un `Clock` (@trame/platform/clock).
 */
const currentTimeRestrictions = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Heure courante interdite : injecter `Clock` (@trame/platform/clock). Voir ADR-0019.',
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: 'Heure courante interdite : injecter `Clock` (@trame/platform/clock). Voir ADR-0019.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Heure courante interdite : injecter `Clock` (@trame/platform/clock). Voir ADR-0019.',
  },
  {
    selector: "MemberExpression[object.name='Temporal'][property.name='Now']",
    message: 'Heure courante interdite : injecter `Clock` (@trame/platform/clock). Voir ADR-0019.',
  },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/generated/**',
      '**/.venv/**',
      '**/.astro/**',
      'tmp/**',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.mts'],
    rules: {
      // Frontières d'architecture (AGENTS.md, règles 1 à 4 et 11 ; ADR-0003, ADR-0026).
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Socle générique : aucune dépendance vers le métier.
            { sourceTag: 'scope:platform', onlyDependOnLibsWithTags: ['scope:platform'] },
            // Contrats partagés : autonomes.
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared', 'scope:platform'],
            },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
            // Hexagonal : le domaine est du TypeScript pur.
            {
              sourceTag: 'layer:domain',
              onlyDependOnLibsWithTags: ['layer:domain', 'scope:shared'],
              bannedExternalImports: [
                '@nestjs/*',
                '@prisma/*',
                'prisma',
                'express',
                'amqplib',
                'pg',
              ],
            },
            {
              sourceTag: 'layer:application',
              onlyDependOnLibsWithTags: [
                'layer:application',
                'layer:domain',
                'scope:shared',
                'scope:platform',
              ],
              bannedExternalImports: ['@prisma/*', 'prisma', 'express', 'amqplib', 'pg'],
            },
            {
              sourceTag: 'layer:infrastructure',
              onlyDependOnLibsWithTags: [
                'layer:infrastructure',
                'layer:application',
                'layer:domain',
                'scope:shared',
                'scope:platform',
              ],
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...currentTimeRestrictions],
    },
  },
  {
    // Lisibilité (AGENTS.md) : le code est écrit pour être relu par un humain, pas pour être court.
    files: ['**/*.ts', '**/*.mts'],
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 5],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-nested-ternary': 'error',
      'no-implicit-coercion': 'error',
      'no-negated-condition': 'error',
    },
  },
  {
    // Outils de test (`@trame/.../testing`) : jamais dans le code de production.
    files: ['**/*.ts', '**/*.mts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts', '**/src/testing.ts', '**/src/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@trame/.+/testing$',
              message: 'Les outils de test ne sont importables que depuis des fichiers de test.',
            },
          ],
        },
      ],
    },
  },
  {
    // Les tests décrivent des scénarios complets : pas de limite de longueur.
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.mts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
];
