import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ListWeekAbsences } from '@trame/api/staff/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type WeekAbsencesQueryV1,
  type WeekAbsencesV1,
  roleV1,
  weekAbsencesQueryV1,
} from '@trame/shared/contracts';
import { toAbsenceV1 } from './presenters';
import { staffErrorMappings } from './staff-error-mappings';

/** Absences des employés d'un site sur une semaine, pour l'écran du planning (US-033). */
@Controller('absences')
@UseInterceptors(new ErrorMappingInterceptor(staffErrorMappings))
export class AbsencesController {
  constructor(private readonly listWeekAbsences: ListWeekAbsences) {}

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(weekAbsencesQueryV1)) query: WeekAbsencesQueryV1,
  ): Promise<WeekAbsencesV1> {
    const absences = await this.listWeekAbsences.execute({
      organizationId: actor.organizationId,
      siteId: query.siteId,
      // Le contrat garantit une date ISO 8601 : la conversion ne peut pas échouer.
      weekStartsOn: Temporal.PlainDate.from(query.weekStartsOn),
    });
    return {
      siteId: query.siteId,
      weekStartsOn: query.weekStartsOn,
      absences: absences.map(toAbsenceV1),
    };
  }
}
