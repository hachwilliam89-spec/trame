import { PrismaService } from '@trame/api/database';
import { SystemClock } from '@trame/platform/clock';
import { UuidV7Generator } from '@trame/platform/ids';
import { readLoadDemoCommand } from './app/demo/load-demo-command';
import { LoadDemoWarehouse } from './app/demo/load-demo-warehouse';
import { PrismaDemoUnitOfWork } from './app/demo/prisma-demo-unit-of-work';

/**
 * Commande opérateur, construite avec l'API et lancée dans son conteneur :
 * `node load-demo.js --organization <UUID>`. Elle écrit sur une ligne JSON le site chargé et le
 * lundi de la semaine à calculer, que l'écran Planning ouvre directement.
 */
async function loadDemo(): Promise<void> {
  const command = readLoadDemoCommand(process.argv.slice(2), process.env);
  const prisma = new PrismaService({ url: command.databaseUrl });
  try {
    const clock = new SystemClock();
    const unitOfWork = new PrismaDemoUnitOfWork(prisma, clock, new UuidV7Generator(clock));
    const loaded = await new LoadDemoWarehouse(unitOfWork, clock).execute(command.organizationId);
    const output = { siteId: loaded.siteId, weekStartsOn: loaded.weekStartsOn.toString() };
    process.stdout.write(JSON.stringify(output) + '\n');
  } finally {
    await prisma.$disconnect();
  }
}

loadDemo().catch((error: unknown) => {
  // Le message seul : les erreurs attendues (usage, configuration, organisation déjà chargée)
  // sont rédigées pour l'opérateur, et aucune ne contient de donnée personnelle.
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message + '\n');
  process.exitCode = 1;
});
