import { Test } from '@nestjs/testing';
import { type TestDatabase, startTestDatabase } from '../testing/test-database';
import { DatabaseModule } from './database.module';
import { DatabaseReadiness } from './database-readiness';
import { PrismaService } from './prisma.service';

describe('PrismaService (intégration)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.stop();
  });

  it('se connecte via @prisma/adapter-pg et exécute une requête', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRootAsync({ useFactory: () => ({ url: database.url }) })],
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

  it('trouve les tables créées par les migrations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRootAsync({ useFactory: () => ({ url: database.url }) })],
    }).compile();

    try {
      const prisma = moduleRef.get(PrismaService);

      await expect(prisma.site.count()).resolves.toBe(0);
      await expect(prisma.shiftTemplate.count()).resolves.toBe(0);
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
