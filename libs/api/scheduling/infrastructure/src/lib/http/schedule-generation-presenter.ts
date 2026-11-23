import type { WeekScheduleGenerations } from '@trame/api/scheduling/application';
import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
import type { ScheduleGenerationV1, WeekScheduleGenerationsV1 } from '@trame/shared/contracts';

export function toScheduleGenerationV1(generation: ScheduleGeneration): ScheduleGenerationV1 {
  return {
    id: generation.id,
    siteId: generation.siteId,
    weekStartsOn: generation.weekStartsOn.toString(),
    status: generation.status,
    problem: generation.problem,
    parameters: generation.parameters,
    excludedEmployees: [...generation.excludedEmployees],
    absenceValuations: [...generation.absenceValuations],
    createdAt: generation.createdAt.toString(),
    ...(generation.outcome === undefined ? {} : { outcome: generation.outcome }),
    ...(generation.failure === undefined ? {} : { failure: generation.failure }),
    ...(generation.finishedAt === undefined
      ? {}
      : { finishedAt: generation.finishedAt.toString() }),
  };
}

export function toWeekScheduleGenerationsV1(
  week: WeekScheduleGenerations,
): WeekScheduleGenerationsV1 {
  return {
    latestAttempt:
      week.latestAttempt === undefined ? null : toScheduleGenerationV1(week.latestAttempt),
    latestSchedule:
      week.latestSchedule === undefined ? null : toScheduleGenerationV1(week.latestSchedule),
  };
}
