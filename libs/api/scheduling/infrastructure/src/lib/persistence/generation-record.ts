import { type Prisma, dateToInstant, dateToPlainDate } from '@trame/api/database';
import type { ScheduleGeneration } from '@trame/api/scheduling/domain';
import {
  excludedEmployeeV1,
  scheduleFailureV1,
  scheduleGenerationStatusV1,
  scheduleOutcomeV1,
  schedulingProblemV1,
  solveParametersV1,
} from '@trame/shared/contracts';
import { z } from 'zod';

const excludedEmployeesV1 = z.array(excludedEmployeeV1);

/** Les colonnes JSON sont relues par leurs contrats : une ligne altérée ne passe pas inaperçue. */
export function toScheduleGeneration(record: Prisma.ScheduleGenerationModel): ScheduleGeneration {
  return {
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    weekStartsOn: dateToPlainDate(record.weekStartsOn),
    status: scheduleGenerationStatusV1.parse(record.status),
    problem: schedulingProblemV1.parse(record.problem),
    parameters: solveParametersV1.parse(record.parameters),
    excludedEmployees: excludedEmployeesV1.parse(record.excludedEmployees),
    createdAt: dateToInstant(record.createdAt),
    ...(record.outcome === null ? {} : { outcome: scheduleOutcomeV1.parse(record.outcome) }),
    ...(record.failure === null ? {} : { failure: scheduleFailureV1.parse(record.failure) }),
    ...(record.finishedAt === null ? {} : { finishedAt: dateToInstant(record.finishedAt) }),
  };
}
