import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/tools/diagnostic-transport',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'diagnostic-transport',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/tools/diagnostic-transport',
      provider: 'v8' as const,
    },
  },
}));
