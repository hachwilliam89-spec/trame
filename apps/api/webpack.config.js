const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      // Commande opérateur du jeu de démonstration, livrée dans l'image de l'API (ADR-0038).
      additionalEntryPoints: [{ entryName: 'load-demo', entryPath: './src/load-demo.ts' }],
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      // Les helpers émis par TypeScript ne sont pas des imports explicites du code source.
      runtimeDependencies: ['tslib'],
      sourceMap: true,
    }),
  ],
};
