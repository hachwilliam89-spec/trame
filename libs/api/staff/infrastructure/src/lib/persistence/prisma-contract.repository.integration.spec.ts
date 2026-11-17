import { PrismaService, DatabaseContext } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { aContract, anEmployee } from '@trame/api/staff/application/testing';
import { type Contract, OverlappingContractError } from '@trame/api/staff/domain';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { PrismaContractRepository } from './prisma-contract.repository';
import { PrismaEmployeeRepository } from './prisma-employee.repository';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const FIRST_PAGE = { limit: 50, after: undefined };

describe('contrats de travail sur PostgreSQL (US-032, jalon 1)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let employees: PrismaEmployeeRepository;
  let contracts: PrismaContractRepository;
  let ids: SequentialIdGenerator;
  let camilleId: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    const context = new DatabaseContext(prisma);
    employees = new PrismaEmployeeRepository(context);
    contracts = new PrismaContractRepository(context);
  }, 120_000);

  beforeEach(async () => {
    // Cette base est propre au fichier ; les autres suites ont leur propre base migrée.
    await prisma.contract.deleteMany();
    await prisma.employeeQualification.deleteMany();
    await prisma.employee.deleteMany();
    ids = new SequentialIdGenerator();
    camilleId = ids.next();
    await employees.add(anEmployee().withId(camilleId).build());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  function contractOfCamille(startsOn: string, endsOn?: string): Contract {
    const builder = aContract().withId(ids.next()).ofEmployee(camilleId).from(startsOn);
    if (endsOn === undefined) {
      return builder.build();
    }
    return builder.until(endsOn).build();
  }

  async function contractIdsOfCamille(): Promise<string[]> {
    const page = await contracts.listByEmployee(ORGANIZATION_A, camilleId, FIRST_PAGE);
    return page.items.map((contract) => contract.id);
  }

  it('enregistre un contrat et le relit avec son volume et sa période', async () => {
    const fixedTerm = contractOfCamille('2025-01-01', '2025-12-31');
    const permanent = contractOfCamille('2026-01-01');
    await contracts.add(fixedTerm);
    await contracts.add(permanent);

    const page = await contracts.listByEmployee(ORGANIZATION_A, camilleId, FIRST_PAGE);

    expect(page.items.map((contract) => contract.id)).toEqual([fixedTerm.id, permanent.id]);
    expect(page.items[0]?.weeklyMinutesMin).toBe(1680);
    expect(page.items[0]?.weeklyMinutesMax).toBe(2100);
    expect(page.items[0]?.startsOn.toString()).toBe('2025-01-01');
    expect(page.items[0]?.endsOn?.toString()).toBe('2025-12-31');
    expect(page.items[1]?.endsOn).toBeUndefined();
  });

  it('refuse un contrat qui chevauche un contrat du même employé, sans rien enregistrer (US-032)', async () => {
    const first = contractOfCamille('2026-01-01', '2026-06-30');
    await contracts.add(first);

    await expect(contracts.add(contractOfCamille('2026-06-30'))).rejects.toThrow(
      OverlappingContractError,
    );

    expect(await contractIdsOfCamille()).toEqual([first.id]);
  });

  it('n’enregistre qu’un seul de deux contrats ajoutés en même temps sur la même période', async () => {
    const first = contractOfCamille('2026-01-01');
    const second = contractOfCamille('2026-03-01');

    const results = await Promise.allSettled([contracts.add(first), contracts.add(second)]);

    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(OverlappingContractError);
    expect(await contractIdsOfCamille()).toHaveLength(1);
  });

  it('BDD isolation : ne liste pas les contrats depuis une autre organisation', async () => {
    await contracts.add(contractOfCamille('2026-01-01'));

    const page = await contracts.listByEmployee(ORGANIZATION_B, camilleId, FIRST_PAGE);

    expect(page.items).toEqual([]);
  });

  it('liste les contrats par ordre de création, page par page', async () => {
    const first = contractOfCamille('2024-01-01', '2024-12-31');
    const second = contractOfCamille('2025-01-01', '2025-12-31');
    const third = contractOfCamille('2026-01-01');
    await contracts.add(first);
    await contracts.add(second);
    await contracts.add(third);

    const firstPage = await contracts.listByEmployee(ORGANIZATION_A, camilleId, {
      limit: 2,
      after: undefined,
    });
    const lastPage = await contracts.listByEmployee(ORGANIZATION_A, camilleId, {
      limit: 2,
      after: second.id,
    });

    expect(firstPage.items.map((contract) => contract.id)).toEqual([first.id, second.id]);
    expect(firstPage.nextCursor).toBe(second.id);
    expect(lastPage.items.map((contract) => contract.id)).toEqual([third.id]);
    expect(lastPage.nextCursor).toBeNull();
  });

  it.each([
    ['un minimum supérieur au maximum', 2101, 2100, '2026-12-31'],
    ['un maximum de plus d’une semaine', 0, 10_081, '2026-12-31'],
    ['une fin antérieure au début', 1680, 2100, '2025-12-31'],
  ])('la migration interdit %s', async (_case, weeklyMinutesMin, weeklyMinutesMax, endsOn) => {
    const contractId = ids.next();

    await expect(prisma.$executeRaw`
      INSERT INTO staff.contracts
        (id, organization_id, employee_id, weekly_minutes_min, weekly_minutes_max, starts_on, ends_on, created_at)
      VALUES
        (${contractId}::uuid, ${ORGANIZATION_A}::uuid, ${camilleId}::uuid, ${weeklyMinutesMin},
         ${weeklyMinutesMax}, '2026-01-01', ${endsOn}::date, '2026-11-15T08:00:00Z')
    `).rejects.toThrow();
  });
});
