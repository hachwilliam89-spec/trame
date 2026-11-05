const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createProjectGraphAsync } = require('@nx/devkit');
const { generatePrunedDeployOutput } = require('@nx/js');

async function main() {
  const rootManifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const manifest = {
    name: 'trame-migrator',
    private: true,
    packageManager: rootManifest.packageManager,
    dependencies: { prisma: rootManifest.devDependencies.prisma },
  };
  const directory = 'dist/migrator';
  mkdirSync(directory, { recursive: true });
  // Nx conserve les résolutions transitives du lockfile, y compris ses deux documents pnpm 12.
  generatePrunedDeployOutput(manifest, await createProjectGraphAsync(), '.', {
    packageManager: 'pnpm',
    outputDirectory: directory,
  });
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
}

void main().catch(() => {
  process.stderr.write('migrator_package_failed\n');
  process.exitCode = 1;
});
