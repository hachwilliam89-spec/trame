import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseContext, DatabaseModule, PrismaService } from '@trame/api/database';
import { type TestDatabase, startTestDatabase } from '@trame/api/database/testing';
import { DefineWeeklyCoverage } from '@trame/api/demand/application';
import {
  CreatePosition,
  CreateShiftTemplate,
  CreateSite,
  CreateSkill,
} from '@trame/api/organization/application';
import { OrganizationModule } from '@trame/api/organization/infrastructure';
import { CreateContract, CreateEmployee, GetEmployee } from '@trame/api/staff/application';
import { AuthModule } from '@trame/platform/auth';
import { testActorResolver } from '@trame/platform/auth/testing';
import { ClockModule } from '@trame/platform/clock';
import { IdsModule } from '@trame/platform/ids';
import { demandModule, staffModule } from './context-modules';

const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';
const MONDAY = Temporal.PlainDate.from('2026-11-23');

class LateFailure extends Error {}

/**
 * Preuve de l'ADR-0038 avec l'assemblage réel des trois contextes : les use cases, leurs dépôts
 * Prisma et les adaptateurs entre contextes rejoignent la même transaction.
 */
describe('unité de travail entre organization, staff et demand (ADR-0038)', () => {
  let database: TestDatabase;
  let moduleRef: TestingModule;
  let context: DatabaseContext;
  let prisma: PrismaService;

  beforeAll(async () => {
    database = await startTestDatabase();
    moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.forRoot({ resolveActor: testActorResolver }),
        ClockModule,
        IdsModule,
        DatabaseModule.forRootAsync({ useFactory: () => ({ url: database.url }) }),
        OrganizationModule,
        staffModule,
        demandModule,
      ],
    }).compile();
    context = moduleRef.get(DatabaseContext);
    prisma = moduleRef.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    await database?.stop();
  });

  function useCase<UseCase>(type: new (...parameters: never[]) => UseCase): UseCase {
    // Les use cases d'écriture ne sont pas exportés par leurs modules : on les lit en dehors.
    return moduleRef.get(type, { strict: false });
  }

  /**
   * Un petit entrepôt complet, écrit par les use cases publics. Les créations d'employé et de
   * besoin relisent le site, la compétence, le poste et le créneau à travers les adaptateurs entre
   * contextes ; le contrat verrouille et relit l'employé.
   */
  async function loadSmallWarehouse(
    organizationId: string,
  ): Promise<{ employeeQualifications: number }> {
    const site = await useCase(CreateSite).execute({
      organizationId,
      code: 'DEMO',
      name: 'Entrepôt de démonstration',
      timeZone: 'Europe/Paris',
    });
    const forklift = await useCase(CreateSkill).execute({
      organizationId,
      name: 'CACES R489 catégorie 3',
    });
    const forkliftDriver = await useCase(CreatePosition).execute({
      organizationId,
      siteId: site.id,
      name: 'Cariste',
      skillIds: [forklift.id],
    });
    const morning = await useCase(CreateShiftTemplate).execute({
      organizationId,
      siteId: site.id,
      label: 'Matin',
      start: Temporal.PlainTime.from('06:00'),
      end: Temporal.PlainTime.from('13:20'),
      break: { start: Temporal.PlainTime.from('10:00'), durationMinutes: 20 },
    });
    const employee = await useCase(CreateEmployee).execute({
      organizationId,
      siteId: site.id,
      firstName: 'Camille',
      lastName: 'Laurent',
      qualifications: [{ skillId: forklift.id, expiresOn: undefined }],
    });
    await useCase(CreateContract).execute({
      organizationId,
      employeeId: employee.id,
      weeklyMinutesMin: 1_680,
      weeklyMinutesMax: 2_100,
      startsOn: MONDAY,
      endsOn: undefined,
    });
    await useCase(DefineWeeklyCoverage).execute({
      organizationId,
      siteId: site.id,
      weekStartsOn: MONDAY,
      needs: [
        {
          date: MONDAY,
          shiftTemplateId: morning.id,
          positionId: forkliftDriver.id,
          requiredCount: 1,
        },
      ],
    });
    const reread = await useCase(GetEmployee).execute({
      organizationId,
      employeeId: employee.id,
    });
    return { employeeQualifications: reread.qualifications.length };
  }

  /** Lignes de l'organisation, table par table, lues hors de toute unité de travail. */
  async function committedRows(organizationId: string): Promise<Record<string, number>> {
    const ofOrganization = { where: { organizationId } };
    return {
      sites: await prisma.site.count(ofOrganization),
      skills: await prisma.skill.count(ofOrganization),
      positions: await prisma.position.count(ofOrganization),
      positionSkills: await prisma.positionSkill.count(ofOrganization),
      shiftTemplates: await prisma.shiftTemplate.count(ofOrganization),
      employees: await prisma.employee.count(ofOrganization),
      employeeQualifications: await prisma.employeeQualification.count(ofOrganization),
      contracts: await prisma.contract.count(ofOrganization),
      weeklyCoverages: await prisma.weeklyCoverage.count(ofOrganization),
      coverageNeeds: await prisma.coverageNeed.count(ofOrganization),
    };
  }

  const NOTHING = {
    sites: 0,
    skills: 0,
    positions: 0,
    positionSkills: 0,
    shiftTemplates: 0,
    employees: 0,
    employeeQualifications: 0,
    contracts: 0,
    weeklyCoverages: 0,
    coverageNeeds: 0,
  };

  it('annule, dans les trois schémas, tout ce que les use cases ont écrit avant une erreur tardive', async () => {
    const load = context.atomically(async () => {
      await loadSmallWarehouse(ORGANIZATION_A);
      throw new LateFailure();
    });

    await expect(load).rejects.toBeInstanceOf(LateFailure);
    expect(await committedRows(ORGANIZATION_A)).toEqual(NOTHING);
  });

  it('relit dans la transaction ce qui reste invisible au-dehors, puis valide le tout', async () => {
    const { rowsSeenFromOutside, employeeQualifications } = await context.atomically(async () => {
      const loaded = await loadSmallWarehouse(ORGANIZATION_B);
      // Une autre connexion ne voit rien avant la validation : les relectures réussies des use
      // cases sont donc passées par la transaction.
      return { ...loaded, rowsSeenFromOutside: await committedRows(ORGANIZATION_B) };
    });

    expect(rowsSeenFromOutside).toEqual(NOTHING);
    expect(employeeQualifications).toBe(1);
    expect(await committedRows(ORGANIZATION_B)).toEqual({
      sites: 1,
      skills: 1,
      positions: 1,
      positionSkills: 1,
      shiftTemplates: 1,
      employees: 1,
      employeeQualifications: 1,
      contracts: 1,
      weeklyCoverages: 1,
      coverageNeeds: 1,
    });
  });
});
