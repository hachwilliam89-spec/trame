import { InvalidWeeklyVolumeError, OverlappingContractError } from '@trame/api/staff/domain';
import { FixedClock } from '@trame/platform/clock';
import { SequentialIdGenerator } from '@trame/platform/ids';
import { anEmployee } from '../../testing/employee-builder';
import { InMemoryContractRepository } from '../../testing/in-memory-contract.repository';
import { InMemoryEmployeeRepository } from '../../testing/in-memory-employee.repository';
import { EmployeeNotFoundError } from '../not-found.errors';
import { CreateContract, type CreateContractCommand } from './create-contract';
import { ListContracts } from './list-contracts';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const CAMILLE = '0190f0a0-0000-7000-8000-0000000000e1';
const SAMIR = '0190f0a0-0000-7000-8000-0000000000e2';
const EMPLOYEE_OF_B = '0190f0a0-0000-7000-8000-0000000000e3';
const UNKNOWN_ID = '0190f0a0-0000-7000-8000-0000000000ff';
const now = Temporal.Instant.from('2026-11-15T08:00:00Z');

async function setUp() {
  const employees = new InMemoryEmployeeRepository();
  await employees.add(anEmployee().withId(CAMILLE).build());
  await employees.add(anEmployee().withId(SAMIR).named('Samir', 'Benali').build());
  await employees.add(anEmployee().withId(EMPLOYEE_OF_B).inOrganization(ORGANIZATION_B).build());
  const contracts = new InMemoryContractRepository();
  return {
    createContract: new CreateContract(
      employees,
      contracts,
      new FixedClock(now),
      new SequentialIdGenerator(),
    ),
    listContracts: new ListContracts(employees, contracts),
  };
}

function fullTime(overrides: Partial<CreateContractCommand> = {}): CreateContractCommand {
  return {
    organizationId: ORGANIZATION_A,
    employeeId: CAMILLE,
    weeklyMinutesMin: 1680,
    weeklyMinutesMax: 2100,
    startsOn: Temporal.PlainDate.from('2026-01-01'),
    endsOn: undefined,
    ...overrides,
  };
}

function period(startsOn: string, endsOn?: string): Partial<CreateContractCommand> {
  return {
    startsOn: Temporal.PlainDate.from(startsOn),
    endsOn: endsOn === undefined ? undefined : Temporal.PlainDate.from(endsOn),
  };
}

type Services = Awaited<ReturnType<typeof setUp>>;

async function contractsOfCamille(services: Services, limit = 50, after?: string) {
  return services.listContracts.execute({
    organizationId: ORGANIZATION_A,
    employeeId: CAMILLE,
    page: { limit, after },
  });
}

describe('cas d’usage des contrats (US-032)', () => {
  it('attribue l’identifiant et l’instant par les ports dédiés', async () => {
    const services = await setUp();

    const contract = await services.createContract.execute(fullTime());

    expect(contract.id).toBe('00000000-0000-7000-8000-000000000001');
    expect(contract.createdAt.equals(now)).toBe(true);
    expect((await contractsOfCamille(services)).items).toEqual([contract]);
  });

  it.each([
    ['absent', UNKNOWN_ID],
    ['d’une autre organisation', EMPLOYEE_OF_B],
  ])('refuse le contrat d’un employé %s', async (_case, employeeId) => {
    const services = await setUp();

    await expect(services.createContract.execute(fullTime({ employeeId }))).rejects.toThrow(
      EmployeeNotFoundError,
    );
  });

  it('refuse un second contrat sur la même période, sans rien enregistrer (US-032)', async () => {
    const services = await setUp();
    const first = await services.createContract.execute(
      fullTime(period('2026-01-01', '2026-06-30')),
    );

    await expect(
      services.createContract.execute(fullTime(period('2026-06-30', '2026-12-31'))),
    ).rejects.toThrow(OverlappingContractError);
    expect((await contractsOfCamille(services)).items).toEqual([first]);
  });

  it('accepte deux contrats qui se suivent', async () => {
    const services = await setUp();
    const first = await services.createContract.execute(
      fullTime(period('2026-01-01', '2026-06-30')),
    );

    const second = await services.createContract.execute(fullTime(period('2026-07-01')));

    expect((await contractsOfCamille(services)).items).toEqual([first, second]);
  });

  it('ne compare que les contrats du même employé', async () => {
    const services = await setUp();
    await services.createContract.execute(fullTime());

    await expect(
      services.createContract.execute(fullTime({ employeeId: SAMIR })),
    ).resolves.toBeDefined();
  });

  it('applique les règles du domaine avant d’enregistrer', async () => {
    const services = await setUp();

    await expect(
      services.createContract.execute(fullTime({ weeklyMinutesMin: 2101 })),
    ).rejects.toThrow(InvalidWeeklyVolumeError);
    expect((await contractsOfCamille(services)).items).toEqual([]);
  });

  it('liste les contrats d’un employé page par page, par ordre de création', async () => {
    const services = await setUp();
    const first = await services.createContract.execute(
      fullTime(period('2024-01-01', '2024-12-31')),
    );
    const second = await services.createContract.execute(
      fullTime(period('2025-01-01', '2025-12-31')),
    );
    const third = await services.createContract.execute(fullTime(period('2026-01-01')));

    const firstPage = await contractsOfCamille(services, 2);
    const lastPage = await contractsOfCamille(services, 2, second.id);

    expect(firstPage.items).toEqual([first, second]);
    expect(firstPage.nextCursor).toBe(second.id);
    expect(lastPage.items).toEqual([third]);
    expect(lastPage.nextCursor).toBeNull();
  });

  it.each([
    ['absent', UNKNOWN_ID],
    ['d’une autre organisation', EMPLOYEE_OF_B],
  ])('BDD isolation : refuse de lister les contrats d’un employé %s', async (_case, employeeId) => {
    const services = await setUp();

    await expect(
      services.listContracts.execute({
        organizationId: ORGANIZATION_A,
        employeeId,
        page: { limit: 50, after: undefined },
      }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });
});
