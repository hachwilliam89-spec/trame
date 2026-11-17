import type { PrismaService } from '@trame/api/database';

/** Lignes d'une organisation dans chaque table que le jeu de démonstration remplit. */
export interface DemoRows {
  sites: number;
  skills: number;
  positions: number;
  positionSkills: number;
  shiftTemplates: number;
  employees: number;
  employeeQualifications: number;
  contracts: number;
  weeklyCoverages: number;
  coverageNeeds: number;
}

export const NO_DEMO_ROWS: DemoRows = {
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

/** Réservé aux tests d'intégration : compte hors de toute unité de travail. */
export async function countDemoRows(
  prisma: PrismaService,
  organizationId: string,
): Promise<DemoRows> {
  const where = { where: { organizationId } };
  return {
    sites: await prisma.site.count(where),
    skills: await prisma.skill.count(where),
    positions: await prisma.position.count(where),
    positionSkills: await prisma.positionSkill.count(where),
    shiftTemplates: await prisma.shiftTemplate.count(where),
    employees: await prisma.employee.count(where),
    employeeQualifications: await prisma.employeeQualification.count(where),
    contracts: await prisma.contract.count(where),
    weeklyCoverages: await prisma.weeklyCoverage.count(where),
    coverageNeeds: await prisma.coverageNeed.count(where),
  };
}
