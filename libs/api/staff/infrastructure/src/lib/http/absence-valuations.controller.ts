import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { GetWeekAbsenceValuations, SetAbsenceDayValuation } from '@trame/api/staff/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type AbsenceDayPathV1,
  type AbsenceDayValuationRequestV1,
  type WeekAbsenceValuationsV1,
  type WeekAbsencesQueryV1,
  absenceDayPathV1,
  absenceDayValuationRequestV1,
  roleV1,
  weekAbsencesQueryV1,
} from '@trame/shared/contracts';
import { toEmployeeAbsenceValuationV1 } from './presenters';
import { resourceIdPipe } from './resource-id.pipe';
import { staffErrorMappings } from './staff-error-mappings';

/**
 * Valorisation des absences (US-033) : les minutes d'absence de chaque employé sur une semaine,
 * avec la référence figée qui les fonde, et la durée d'un jour couvert en partie quand la
 * semaine n'a pas de planning de référence.
 */
@Controller()
@UseInterceptors(new ErrorMappingInterceptor(staffErrorMappings))
export class AbsenceValuationsController {
  constructor(
    private readonly getWeekAbsenceValuations: GetWeekAbsenceValuations,
    private readonly setAbsenceDayValuation: SetAbsenceDayValuation,
  ) {}

  @Get('absence-valuations')
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(weekAbsencesQueryV1)) query: WeekAbsencesQueryV1,
  ): Promise<WeekAbsenceValuationsV1> {
    const valuations = await this.getWeekAbsenceValuations.execute({
      organizationId: actor.organizationId,
      siteId: query.siteId,
      // Le contrat garantit une date ISO 8601 : la conversion ne peut pas échouer.
      weekStartsOn: Temporal.PlainDate.from(query.weekStartsOn),
    });
    return {
      siteId: query.siteId,
      weekStartsOn: query.weekStartsOn,
      valuations: valuations.map(toEmployeeAbsenceValuationV1),
    };
  }

  @Put('employees/:employeeId/absence-days/:date')
  @HttpCode(204)
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async giveDayValuation(
    @CurrentActor() actor: Actor,
    @Param('employeeId', resourceIdPipe) employeeId: string,
    @Param(new ZodValidationPipe(absenceDayPathV1)) path: AbsenceDayPathV1,
    @Body(new ZodValidationPipe(absenceDayValuationRequestV1)) body: AbsenceDayValuationRequestV1,
  ): Promise<void> {
    await this.setAbsenceDayValuation.execute({
      organizationId: actor.organizationId,
      employeeId,
      day: Temporal.PlainDate.from(path.date),
      valuedMinutes: body.valuedMinutes,
    });
  }
}
