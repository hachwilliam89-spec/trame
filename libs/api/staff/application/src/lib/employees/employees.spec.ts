import { InvalidEmployeeFirstNameError } from '@trame/api/staff/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { InMemoryEmployeeRepository } from '../../testing/in-memory-employee.repository';
import { InMemoryOrganizationCatalog } from '../../testing/in-memory-organization-catalog';
import { EmployeeNotFoundError, SiteNotFoundError, SkillNotFoundError } from '../not-found.errors';
import { CreateEmployee, type CreateEmployeeCommand } from './create-employee';
import { GetEmployee } from './get-employee';
import { ListEmployees } from './list-employees';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const WAREHOUSE_OF_A = '0190f0a0-0000-7000-8000-0000000000d1';
const SECOND_SITE_OF_A = '0190f0a0-0000-7000-8000-0000000000d2';
const WAREHOUSE_OF_B = '0190f0a0-0000-7000-8000-0000000000d3';
const CACES_OF_A = '0190f0a0-0000-7000-8000-0000000000c3';
const CACES_OF_B = '0190f0a0-0000-7000-8000-0000000000c4';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';
const now = Temporal.Instant.from('2026-11-15T08:00:00Z');

function setUp() {
  const catalog = new InMemoryOrganizationCatalog();
  catalog.addSite(ORGANIZATION_A, WAREHOUSE_OF_A);
  catalog.addSite(ORGANIZATION_A, SECOND_SITE_OF_A);
  catalog.addSkill(ORGANIZATION_A, CACES_OF_A);
  catalog.addSite(ORGANIZATION_B, WAREHOUSE_OF_B);
  catalog.addSkill(ORGANIZATION_B, CACES_OF_B);
  const employees = new InMemoryEmployeeRepository();
  return {
    createEmployee: new CreateEmployee(
      catalog,
      employees,
      new FixedClock(now),
      new SequentialIdGenerator(),
    ),
    getEmployee: new GetEmployee(employees),
    listEmployees: new ListEmployees(catalog, employees),
  };
}

function forkliftDriver(overrides: Partial<CreateEmployeeCommand> = {}): CreateEmployeeCommand {
  return {
    organizationId: ORGANIZATION_A,
    siteId: WAREHOUSE_OF_A,
    firstName: 'Camille',
    lastName: 'Martin',
    qualifications: [{ skillId: CACES_OF_A, expiresOn: Temporal.PlainDate.from('2026-12-09') }],
    ...overrides,
  };
}

async function listWarehouseOfA(services: ReturnType<typeof setUp>, limit = 50, after?: string) {
  return services.listEmployees.execute({
    organizationId: ORGANIZATION_A,
    siteId: WAREHOUSE_OF_A,
    page: { limit, after },
  });
}

describe('cas d’usage des employés (US-031)', () => {
  it('attribue l’identifiant et l’instant par les ports dédiés', async () => {
    const services = setUp();

    const employee = await services.createEmployee.execute(forkliftDriver());

    expect(employee.id).toBe('00000000-0000-7000-8000-000000000001');
    expect(employee.createdAt.equals(now)).toBe(true);
  });

  it('enregistre l’employé avec ses habilitations', async () => {
    const services = setUp();
    const created = await services.createEmployee.execute(forkliftDriver());

    const read = await services.getEmployee.execute({
      organizationId: ORGANIZATION_A,
      employeeId: created.id,
    });

    expect(read).toBe(created);
    expect(read.qualifications).toHaveLength(1);
    expect(read.qualifications[0]?.skillId).toBe(CACES_OF_A);
    expect(read.qualifications[0]?.expiresOn?.toString()).toBe('2026-12-09');
  });

  it.each([
    ['absent', UNKNOWN_ID],
    ['d’une autre organisation', WAREHOUSE_OF_B],
  ])('refuse un site %s, sans rien enregistrer', async (_case, siteId) => {
    const services = setUp();

    await expect(services.createEmployee.execute(forkliftDriver({ siteId }))).rejects.toThrow(
      SiteNotFoundError,
    );
    expect((await listWarehouseOfA(services)).items).toEqual([]);
  });

  it.each([
    ['absente', UNKNOWN_ID],
    ['d’une autre organisation', CACES_OF_B],
  ])('refuse une compétence %s, sans rien enregistrer', async (_case, skillId) => {
    const services = setUp();
    const command = forkliftDriver({ qualifications: [{ skillId, expiresOn: undefined }] });

    await expect(services.createEmployee.execute(command)).rejects.toThrow(SkillNotFoundError);
    expect((await listWarehouseOfA(services)).items).toEqual([]);
  });

  it('applique les règles du domaine avant d’enregistrer', async () => {
    const services = setUp();

    await expect(
      services.createEmployee.execute(forkliftDriver({ firstName: '   ' })),
    ).rejects.toThrow(InvalidEmployeeFirstNameError);
    expect((await listWarehouseOfA(services)).items).toEqual([]);
  });

  it('BDD isolation : un employé d’une autre organisation est introuvable', async () => {
    const services = setUp();
    const created = await services.createEmployee.execute(forkliftDriver());

    await expect(
      services.getEmployee.execute({ organizationId: ORGANIZATION_B, employeeId: created.id }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });

  it('signale un employé absent', async () => {
    const services = setUp();

    await expect(
      services.getEmployee.execute({ organizationId: ORGANIZATION_A, employeeId: UNKNOWN_ID }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });

  it('liste les employés d’un site page par page, par ordre de création', async () => {
    const services = setUp();
    const first = await services.createEmployee.execute(forkliftDriver({ firstName: 'Camille' }));
    const second = await services.createEmployee.execute(forkliftDriver({ firstName: 'Samir' }));
    const third = await services.createEmployee.execute(forkliftDriver({ firstName: 'Inès' }));

    const firstPage = await listWarehouseOfA(services, 2);
    const lastPage = await listWarehouseOfA(services, 2, second.id);

    expect(firstPage.items).toEqual([first, second]);
    expect(firstPage.nextCursor).toBe(second.id);
    expect(lastPage.items).toEqual([third]);
    expect(lastPage.nextCursor).toBeNull();
  });

  it('ne liste que les employés du site demandé', async () => {
    const services = setUp();
    const atWarehouse = await services.createEmployee.execute(forkliftDriver());
    await services.createEmployee.execute(forkliftDriver({ siteId: SECOND_SITE_OF_A }));

    expect((await listWarehouseOfA(services)).items).toEqual([atWarehouse]);
  });

  it.each([
    ['absent', UNKNOWN_ID],
    ['d’une autre organisation', WAREHOUSE_OF_B],
  ])('refuse de lister les employés d’un site %s', async (_case, siteId) => {
    const services = setUp();

    await expect(
      services.listEmployees.execute({
        organizationId: ORGANIZATION_A,
        siteId,
        page: { limit: 50, after: undefined },
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });
});
