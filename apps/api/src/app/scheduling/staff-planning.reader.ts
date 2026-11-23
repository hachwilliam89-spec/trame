import { Injectable } from '@nestjs/common';
import type {
  PlanningAbsence,
  PlanningContract,
  PlanningEmployee,
  PlanningShift,
  WeekPlanning,
} from '@trame/api/scheduling/domain';
import {
  type EmployeeAbsenceValuation,
  ListContracts,
  ListEmployees,
  PrepareWeekAbsences,
} from '@trame/api/staff/application';
import { EqualShareReference, PlanningReference } from '@trame/api/staff/domain';
import type { Page, PageRequest } from '@trame/platform/pagination';
import type { GenerationAbsenceValuationV1 } from '@trame/shared/contracts';

const PAGE_SIZE = 100;

/** Ce que la génération lit des absences d'une semaine (US-033). */
export type WeekAbsencesForPlanning = Pick<
  WeekPlanning,
  'absences' | 'absenceValuations' | 'employeesWithAbsenceToDefine'
>;

/**
 * Lit dans le contexte `staff` les salariés d'un site, leurs habilitations, tous leurs contrats et
 * leurs absences. Le nom des salariés n'en sort pas : le problème n'en contient aucun.
 */
@Injectable()
export class StaffPlanningReader {
  constructor(
    private readonly listEmployees: ListEmployees,
    private readonly listContracts: ListContracts,
    private readonly prepareWeekAbsences: PrepareWeekAbsences,
  ) {}

  async employeesOf(organizationId: string, siteId: string): Promise<PlanningEmployee[]> {
    const employees = await readAllPages((page) =>
      this.listEmployees.execute({ organizationId, siteId, page }),
    );
    const planningEmployees: PlanningEmployee[] = [];
    for (const employee of employees) {
      planningEmployees.push({
        id: employee.id,
        qualifications: employee.qualifications,
        contracts: await this.contractsOf(organizationId, employee.id),
      });
    }
    return planningEmployees;
  }

  /**
   * Les absences de la semaine et celles qui touchent ses créneaux, avec leurs valorisations.
   * Le contexte `staff` retente d'abord le gel des références « à définir », puis lit tout dans
   * un même état (US-033).
   */
  async absencesOf(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    shifts: readonly PlanningShift[],
  ): Promise<WeekAbsencesForPlanning> {
    const prepared = await this.prepareWeekAbsences.execute({
      organizationId,
      siteId,
      weekStartsOn,
      absencesWithin: spanOf(shifts),
    });
    const absences: PlanningAbsence[] = prepared.absences.map((absence) => ({
      employeeId: absence.employeeId,
      startsAt: absence.startsAt,
      endsAt: absence.endsAt,
    }));
    const absenceValuations: GenerationAbsenceValuationV1[] = [];
    const employeesWithAbsenceToDefine: string[] = [];
    for (const valuation of prepared.valuations) {
      const valued = toGenerationAbsenceValuation(valuation);
      if (valued === undefined) {
        employeesWithAbsenceToDefine.push(valuation.employeeId);
        continue;
      }
      absenceValuations.push(valued);
    }
    return { absences, absenceValuations, employeesWithAbsenceToDefine };
  }

  private async contractsOf(
    organizationId: string,
    employeeId: string,
  ): Promise<PlanningContract[]> {
    const contracts = await readAllPages((page) =>
      this.listContracts.execute({ organizationId, employeeId, page }),
    );
    return contracts.map((contract) => ({
      weeklyMinutesMin: contract.weeklyMinutesMin,
      weeklyMinutesMax: contract.weeklyMinutesMax,
      startsOn: contract.startsOn,
      endsOn: contract.endsOn,
    }));
  }
}

/** Du début du premier créneau à la fin du dernier ; `undefined` sans créneau. */
function spanOf(
  shifts: readonly PlanningShift[],
): { start: Temporal.Instant; end: Temporal.Instant } | undefined {
  const starts = shifts.map((shift) => shift.startsAt).sort(Temporal.Instant.compare);
  const ends = shifts.map((shift) => shift.endsAt).sort(Temporal.Instant.compare);
  const start = starts.at(0);
  const end = ends.at(-1);
  if (start === undefined || end === undefined) {
    return undefined;
  }
  return { start, end };
}

/**
 * La valorisation et son calcul, ou `undefined` si elle reste « à définir ». Une valorisation
 * sans référence ne compte jamais pour zéro en silence : elle est traitée comme à définir.
 */
function toGenerationAbsenceValuation({
  employeeId,
  reference,
  valuation,
}: EmployeeAbsenceValuation): GenerationAbsenceValuationV1 | undefined {
  if (valuation.status === 'TO_DEFINE') {
    return undefined;
  }
  const { absenceMinutes } = valuation;
  if (reference instanceof PlanningReference) {
    return {
      employeeId,
      absenceMinutes,
      method: 'REFERENCE_PLANNING',
      referenceGenerationId: reference.generationId,
    };
  }
  if (reference instanceof EqualShareReference) {
    return {
      employeeId,
      absenceMinutes,
      method: 'EQUAL_SHARE_OF_ACTIVITY_DAYS',
      weeklyMinimumMinutes: reference.weeklyMinimumMinutes,
      activityDays: reference.activityDays.map((day) => day.toString()),
      dailyShareMinutes: reference.dailyShareMinutes,
    };
  }
  return undefined;
}

async function readAllPages<T>(read: (page: PageRequest) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let page: PageRequest = { limit: PAGE_SIZE };
  while (true) {
    const result = await read(page);
    items.push(...result.items);
    if (result.nextCursor === null) {
      return items;
    }
    page = { limit: PAGE_SIZE, after: result.nextCursor };
  }
}
