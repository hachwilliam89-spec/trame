import { Injectable } from '@nestjs/common';
import { GetWeeklyCoverage } from '@trame/api/demand/application';
import { GetShiftTemplateDurations } from '@trame/api/organization/application';
import { GetLatestWeekSchedule } from '@trame/api/scheduling/application';
import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { PlanningReferenceSource, ReferencePlanning } from '@trame/api/staff/application';
import type { InstantInterval, WorkedShift } from '@trame/api/staff/domain';
import type { SchedulingProblemV1 } from '@trame/shared/contracts';

type ProblemShift = SchedulingProblemV1['shifts'][number];

/**
 * Répond au contexte `staff` par les use cases publics de `scheduling`, `organization` et
 * `demand` : le planning qui sert de référence à une absence (US-033), et les jours d'activité de
 * la semaine pour la convention des parts égales.
 */
@Injectable()
export class PlanningReferenceAdapter implements PlanningReferenceSource {
  constructor(
    private readonly getLatestWeekSchedule: GetLatestWeekSchedule,
    private readonly getShiftTemplateDurations: GetShiftTemplateDurations,
    private readonly getWeeklyCoverage: GetWeeklyCoverage,
  ) {}

  async latestPlanningOf(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
    employeeId: string,
  ): Promise<ReferencePlanning | undefined> {
    const generation = await this.getLatestWeekSchedule.execute({
      organizationId,
      siteId,
      weekStartsOn,
    });
    if (generation === undefined) {
      return undefined;
    }
    const workedShifts: WorkedShift[] = [];
    for (const shift of shiftsHeldBy(generation, employeeId)) {
      workedShifts.push(await this.workedShiftOf(organizationId, siteId, shift));
    }
    return { generationId: generation.id, workedShifts };
  }

  async activityDaysOf(
    organizationId: string,
    siteId: string,
    weekStartsOn: Temporal.PlainDate,
  ): Promise<Temporal.PlainDate[]> {
    const coverage = await this.getWeeklyCoverage.execute({ organizationId, siteId, weekStartsOn });
    const days = new Map<string, Temporal.PlainDate>();
    for (const need of coverage?.needs ?? []) {
      days.set(need.date.toString(), need.date);
    }
    return [...days.values()].sort(Temporal.PlainDate.compare);
  }

  /** Les instants du shift viennent du planning ; sa pause, du créneau type ce jour-là. */
  private async workedShiftOf(
    organizationId: string,
    siteId: string,
    shift: ProblemShift,
  ): Promise<WorkedShift> {
    const durations = await this.getShiftTemplateDurations.execute({
      organizationId,
      siteId,
      shiftTemplateId: shift.shiftTemplateId,
      date: Temporal.PlainDate.from(shift.date),
    });
    const breaks: InstantInterval[] = [];
    if (!durations.breakStartsAt.equals(durations.breakEndsAt)) {
      breaks.push({ start: durations.breakStartsAt, end: durations.breakEndsAt });
    }
    return {
      startsAt: Temporal.Instant.from(shift.startsAt),
      endsAt: Temporal.Instant.from(shift.endsAt),
      breaks,
    };
  }
}

/** Shifts que le salarié tient dans le planning de la génération, par ordre de début. */
function shiftsHeldBy(generation: ScheduleGeneration, employeeId: string): ProblemShift[] {
  const schedule = generation.outcome?.result.schedule;
  if (schedule === undefined || schedule === null) {
    return [];
  }
  const heldShiftIds = new Set<string>();
  for (const assignment of schedule.assignments) {
    if (assignment.employeeId === employeeId) {
      heldShiftIds.add(assignment.shiftId);
    }
  }
  return generation.problem.shifts.filter((shift) => heldShiftIds.has(shift.id));
}
