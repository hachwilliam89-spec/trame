import { defineConfig } from 'vitest/config';

// Démarrage réel de la stack : Docker et son démon sont requis.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../node_modules/.vite/infra-integration',
  test: {
    name: 'infra-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    // Les scénarios partagent une même stack et s'enchaînent dans l'ordre du fichier.
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 300_000,
    reporters: ['default'],
  },
}));
