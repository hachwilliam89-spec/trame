import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/relay',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'relay',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/relay',
      provider: 'v8' as const,
    },
  },
}));
