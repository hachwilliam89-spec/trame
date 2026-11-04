import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/api/scheduling/infrastructure-integration',
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-scheduling-infrastructure-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
}));
