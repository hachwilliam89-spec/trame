import { PrismaService, DatabaseContext } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { anEmployee } from '@trame/api/staff/application/testing';
import type { Employee } from '@trame/api/staff/domain';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { PrismaEmployeeRepository } from './prisma-employee.repository';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const WAREHOUSE = '0190f0a0-0000-7000-8000-0000000000d1';
const SECOND_SITE = '0190f0a0-0000-7000-8000-0000000000d2';
const CACES_CATEGORY_3 = '0190f0a0-0000-7000-8000-0000000000c3';
const CACES_CATEGORY_5 = '0190f0a0-0000-7000-8000-0000000000c5';

function skillIdsOf(employee: Employee): string[] {
  return employee.qualifications.map((qualification) => qualification.skillId);
}

function expiryDatesOf(employee: Employee): (string | undefined)[] {
  return employee.qualifications.map((qualification) => qualification.expiresOn?.toString());
}

describe('employés sur PostgreSQL (US-031, jalon 1)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let employees: PrismaEmployeeRepository;
  let ids: SequentialIdGenerator;

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = new PrismaService({ url: database.url });
    const context = new DatabaseContext(prisma);
    employees = new PrismaEmployeeRepository(context);
  }, 120_000);

  beforeEach(async () => {
    // Cette base est propre au fichier ; les autres suites ont leur propre base migrée.
    await prisma.employeeQualification.deleteMany();
    await prisma.employee.deleteMany();
    ids = new SequentialIdGenerator();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.stop();
  });

  async function readEmployee(organizationId: string, employeeId: string): Promise<Employee> {
    const employee = await employees.findById(organizationId, employeeId);
    if (employee === undefined) {
      throw new Error('Employé non relu.');
    }
    return employee;
  }

  it('enregistre un employé et le relit avec ses habilitations, date d’expiration comprise', async () => {
    const forkliftDriver = anEmployee()
      .withId(ids.next())
      .named('Camille', 'Martin')
      .qualifiedFor(CACES_CATEGORY_3, '2026-12-09')
      .qualifiedFor(CACES_CATEGORY_5)
      .build();
    await employees.add(forkliftDriver);

    const read = await readEmployee(ORGANIZATION_A, forkliftDriver.id);

    expect(read.firstName).toBe('Camille');
    expect(read.lastName).toBe('Martin');
    expect(read.siteId).toBe(WAREHOUSE);
    expect(read.createdAt.equals(forkliftDriver.createdAt)).toBe(true);
    expect(skillIdsOf(read)).toEqual([CACES_CATEGORY_3, CACES_CATEGORY_5]);
    expect(expiryDatesOf(read)).toEqual(['2026-12-09', undefined]);
  });

  it('BDD isolation : ne lit pas un employé depuis une autre organisation', async () => {
    const employee = anEmployee().withId(ids.next()).build();
    await employees.add(employee);

    expect(await employees.findById(ORGANIZATION_B, employee.id)).toBeUndefined();
  });

  it('BDD isolation : ne liste que les employés du site et de l’organisation demandés', async () => {
    const atWarehouse = anEmployee().withId(ids.next()).build();
    const atSecondSite = anEmployee().withId(ids.next()).atSite(SECOND_SITE).build();
    const ofOrganizationB = anEmployee().withId(ids.next()).inOrganization(ORGANIZATION_B).build();
    await employees.add(atWarehouse);
    await employees.add(atSecondSite);
    await employees.add(ofOrganizationB);

    const page = await employees.listBySite(ORGANIZATION_A, WAREHOUSE, {
      limit: 50,
      after: undefined,
    });

    expect(page.items.map((employee) => employee.id)).toEqual([atWarehouse.id]);
    expect(page.nextCursor).toBeNull();
  });

  it('liste les employés par ordre de création, page par page', async () => {
    const first = anEmployee().withId(ids.next()).build();
    const second = anEmployee().withId(ids.next()).build();
    const third = anEmployee().withId(ids.next()).build();
    await employees.add(first);
    await employees.add(second);
    await employees.add(third);

    const firstPage = await employees.listBySite(ORGANIZATION_A, WAREHOUSE, {
      limit: 2,
      after: undefined,
    });
    const lastPage = await employees.listBySite(ORGANIZATION_A, WAREHOUSE, {
      limit: 2,
      after: second.id,
    });

    expect(firstPage.items.map((employee) => employee.id)).toEqual([first.id, second.id]);
    expect(firstPage.nextCursor).toBe(second.id);
    expect(lastPage.items.map((employee) => employee.id)).toEqual([third.id]);
    expect(lastPage.nextCursor).toBeNull();
  });

  it('n’enregistre rien si une habilitation est refusée par la base', async () => {
    const employee = anEmployee().withId(ids.next()).qualifiedFor(CACES_CATEGORY_3).build();
    await employees.add(employee);
    // Même identifiant : la seconde écriture échoue, et sa transaction n'ajoute aucune habilitation.
    const duplicate = anEmployee().withId(employee.id).qualifiedFor(CACES_CATEGORY_5).build();

    await expect(employees.add(duplicate)).rejects.toThrow();

    const read = await readEmployee(ORGANIZATION_A, employee.id);
    expect(skillIdsOf(read)).toEqual([CACES_CATEGORY_3]);
  });

  it('la migration interdit une habilitation rattachée à l’employé d’une autre organisation', async () => {
    const employee = anEmployee().withId(ids.next()).build();
    await employees.add(employee);

    await expect(prisma.$executeRaw`
      INSERT INTO staff.employee_qualifications (organization_id, employee_id, skill_id)
      VALUES (${ORGANIZATION_B}::uuid, ${employee.id}::uuid, ${CACES_CATEGORY_3}::uuid)
    `).rejects.toThrow();
  });
});
