import { defineConfig } from 'vitest/config';

// Répétition du staging (US-005 B2a, étape 4) : vraies images publiées, Traefik, stack partagée.
// Lancée par .github/workflows/rehearsal.yml, sur un runner jetable.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'rehearsal',
    globals: true,
    environment: 'node',
    include: ['src/**/*.rehearsal.spec.ts'],
    fileParallelism: false,
    hookTimeout: 1_800_000,
    testTimeout: 900_000,
  },
});
