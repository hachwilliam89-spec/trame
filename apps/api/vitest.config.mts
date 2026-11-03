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
      // Fournisseur d'identité fictif : aucun test ne le joint, sauf app.oidc.spec.ts, qui remplace
      // ces valeurs par celles de son serveur JWKS local.
      OIDC_ISSUER_URL: 'https://idp.test/realms/trame',
      OIDC_AUDIENCE: 'trame-api',
      OIDC_JWKS_URL: 'https://idp.test/realms/trame/protocol/openid-connect/certs',
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
