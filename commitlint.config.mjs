// Conventional Commits avec un scope obligatoire, description en français (AGENTS.md).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [2, 'never'],
    'scope-enum': [
      2,
      'always',
      [
        // Apps et libs techniques
        'repo',
        'api',
        'web',
        'engine',
        'docs',
        'contracts',
        'platform',
        'database',
        'infra',
        'ci',
        'deps',
        // Bounded contexts
        'organization',
        'staff',
        'rules',
        'demand',
        'scheduling',
        'swaps',
        'forecasting',
        'assistant',
      ],
    ],
    // Le français garde ses majuscules (noms propres, sigles).
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
