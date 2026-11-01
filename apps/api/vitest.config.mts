import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  // SWC émet les métadonnées de décorateurs dont dépend l'injection NestJS.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api',
    watch: false,
    globals: true,
    environment: 'node',
    // AppModule valide l'environnement dès son import (ConfigModule.forRoot).
    env: {
      DATABASE_URL: 'postgresql://trame:trame@localhost:5432/trame',
      LOG_LEVEL: 'silent',
    },
    include: ['{src,tests}/**/*.{test,spec}.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/api',
      provider: 'v8' as const,
    },
  },
}));
