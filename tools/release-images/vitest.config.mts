import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/release-images',
  test: {
    name: 'release-images',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/tools/release-images',
      provider: 'v8' as const,
    },
  },
}));
