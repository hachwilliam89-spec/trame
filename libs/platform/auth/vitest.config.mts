import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/platform/auth',
  // SWC émet les métadonnées de décorateurs dont dépend l'injection NestJS.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'platform-auth',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/platform/auth',
      provider: 'v8' as const,
    },
  },
}));
