import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/web/scheduling/feature-planning',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'web-scheduling-feature-planning',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/web/scheduling/feature-planning',
      provider: 'v8' as const,
    },
  },
}));
