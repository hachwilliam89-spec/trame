import type { DemoLoadingSteps } from './demo-loading-steps';
import type {
  DemoEmployee,
  DemoPositionKey,
  DemoShiftKey,
  DemoSkillKey,
  DemoWarehouse,
} from './demo-warehouse';

/**
 * Écrit un entrepôt de démonstration par les use cases publics des trois contextes, dans l'ordre
 * de leurs dépendances : site, compétences, postes, créneaux, salariés et contrats, besoins.
 */
export class DemoWarehouseWriter {
  private readonly skillIds = new Map<DemoSkillKey, string>();
  private readonly positionIds = new Map<DemoPositionKey, string>();
  private readonly shiftTemplateIds = new Map<DemoShiftKey, string>();

  constructor(
    private readonly steps: DemoLoadingSteps,
    private readonly organizationId: string,
  ) {}

  /** Renvoie l'identifiant du site créé. */
  async write(warehouse: DemoWarehouse, weekStartsOn: Temporal.PlainDate): Promise<string> {
    const site = await this.steps.createSite.execute({
      organizationId: this.organizationId,
      ...warehouse.site,
    });
    await this.writeSkills(warehouse);
    await this.writePositions(warehouse, site.id);
    await this.writeShiftTemplates(warehouse, site.id);
    for (const employee of warehouse.employees) {
      await this.writeEmployee(employee, site.id);
    }
    await this.writeNeeds(warehouse, site.id, weekStartsOn);
    return site.id;
  }

  private async writeSkills(warehouse: DemoWarehouse): Promise<void> {
    for (const skill of warehouse.skills) {
      const created = await this.steps.createSkill.execute({
        organizationId: this.organizationId,
        name: skill.name,
      });
      this.skillIds.set(skill.key, created.id);
    }
  }

  private async writePositions(warehouse: DemoWarehouse, siteId: string): Promise<void> {
    for (const position of warehouse.positions) {
      const created = await this.steps.createPosition.execute({
        organizationId: this.organizationId,
        siteId,
        name: position.name,
        skillIds: position.skills.map((skill) => idOf(this.skillIds, skill)),
      });
      this.positionIds.set(position.key, created.id);
    }
  }

  private async writeShiftTemplates(warehouse: DemoWarehouse, siteId: string): Promise<void> {
    for (const shiftTemplate of warehouse.shiftTemplates) {
      const created = await this.steps.createShiftTemplate.execute({
        organizationId: this.organizationId,
        siteId,
        label: shiftTemplate.label,
        start: shiftTemplate.start,
        end: shiftTemplate.end,
        break: shiftTemplate.break,
      });
      this.shiftTemplateIds.set(shiftTemplate.key, created.id);
    }
  }

  private async writeEmployee(employee: DemoEmployee, siteId: string): Promise<void> {
    const created = await this.steps.createEmployee.execute({
      organizationId: this.organizationId,
      siteId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      qualifications: employee.qualifications.map((qualification) => ({
        skillId: idOf(this.skillIds, qualification.skill),
        expiresOn: qualification.expiresOn,
      })),
    });
    await this.steps.createContract.execute({
      organizationId: this.organizationId,
      employeeId: created.id,
      ...employee.contract,
      endsOn: undefined,
    });
  }

  private async writeNeeds(
    warehouse: DemoWarehouse,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<void> {
    await this.steps.defineWeeklyCoverage.execute({
      organizationId: this.organizationId,
      siteId,
      weekStartsOn,
      needs: warehouse.needs.map((need) => ({
        date: need.date,
        shiftTemplateId: idOf(this.shiftTemplateIds, need.shift),
        positionId: idOf(this.positionIds, need.position),
        requiredCount: need.requiredCount,
      })),
    });
  }
}

/** Identifiant attribué à une clé du jeu ; une clé inconnue est une erreur du jeu lui-même. */
function idOf<Key extends string>(ids: ReadonlyMap<Key, string>, key: Key): string {
  const id = ids.get(key);
  if (id === undefined) {
    throw new Error(`Jeu de démonstration incohérent : « ${key} » n'a pas été créé.`);
  }
  return id;
}
