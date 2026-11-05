import { defineConfig } from 'vitest/config';

// Contrôles de la configuration Compose : la CLI Docker suffit, sans démon.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../node_modules/.vite/infra',
  test: {
    name: 'infra',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts', 'src/**/*.images.spec.ts'],
    passWithNoTests: false,
    reporters: ['default'],
  },
}));
