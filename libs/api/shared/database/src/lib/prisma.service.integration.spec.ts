import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from './database.module';
import { DatabaseReadiness } from './database-readiness';
import { PrismaService } from './prisma.service';

// Vrai Postgres via Testcontainers (Docker requis). `TEST_DATABASE_URL` permet de viser une base
// déjà démarrée, quand Docker n'est pas disponible.
const externalUrl = process.env['TEST_DATABASE_URL'];

describe('PrismaService (intégration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let url: string;

  beforeAll(async () => {
    if (externalUrl === undefined) {
      container = await new PostgreSqlContainer('postgres:18-alpine').start();
      url = container.getConnectionUri();
    } else {
      url = externalUrl;
    }
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('se connecte via @prisma/adapter-pg et exécute une requête', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRootAsync({ useFactory: () => ({ url }) })],
    }).compile();
    await moduleRef.init();

    try {
      const prisma = moduleRef.get(PrismaService);
      const rows = await prisma.$queryRaw<{ answer: number }[]>`SELECT 1::int AS answer`;

      expect(rows).toEqual([{ answer: 1 }]);
      await expect(moduleRef.get(DatabaseReadiness).check()).resolves.toBeUndefined();
    } finally {
      await moduleRef.close();
    }
  });

  it("l'indicateur échoue quand la base ne répond pas", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRootAsync({
          useFactory: () => ({ url: 'postgresql://trame:trame@127.0.0.1:1/absente' }),
        }),
      ],
    }).compile();

    try {
      await expect(moduleRef.get(DatabaseReadiness).check()).rejects.toThrow();
    } finally {
      await moduleRef.close();
    }
  });
});
