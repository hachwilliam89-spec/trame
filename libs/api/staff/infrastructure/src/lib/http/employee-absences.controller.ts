import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { DeclareAbsence, DeleteAbsence, UpdateAbsence } from '@trame/api/staff/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type AbsenceRequestV1,
  type AbsenceV1,
  absenceRequestV1,
  roleV1,
} from '@trame/shared/contracts';
import { toAbsenceV1 } from './presenters';
import { resourceIdPipe } from './resource-id.pipe';
import { staffErrorMappings } from './staff-error-mappings';

/**
 * Absences d'un employé de l'organisation de l'utilisateur (US-033), déclarées par le manager.
 * Une absence ne modifie aucun planning existant : seules les générations suivantes en tiennent
 * compte.
 */
@Controller('employees/:employeeId/absences')
@UseInterceptors(new ErrorMappingInterceptor(staffErrorMappings))
export class EmployeeAbsencesController {
  constructor(
    private readonly declareAbsence: DeclareAbsence,
    private readonly updateAbsence: UpdateAbsence,
    private readonly deleteAbsence: DeleteAbsence,
  ) {}

  @Post()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async declare(
    @CurrentActor() actor: Actor,
    @Param('employeeId', resourceIdPipe) employeeId: string,
    @Body(new ZodValidationPipe(absenceRequestV1)) body: AbsenceRequestV1,
  ): Promise<AbsenceV1> {
    const absence = await this.declareAbsence.execute({
      organizationId: actor.organizationId,
      employeeId,
      ...toPeriod(body),
    });
    return toAbsenceV1(absence);
  }

  @Put(':absenceId')
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async update(
    @CurrentActor() actor: Actor,
    @Param('employeeId', resourceIdPipe) employeeId: string,
    @Param('absenceId', resourceIdPipe) absenceId: string,
    @Body(new ZodValidationPipe(absenceRequestV1)) body: AbsenceRequestV1,
  ): Promise<AbsenceV1> {
    const absence = await this.updateAbsence.execute({
      organizationId: actor.organizationId,
      employeeId,
      absenceId,
      ...toPeriod(body),
    });
    return toAbsenceV1(absence);
  }

  @Delete(':absenceId')
  @HttpCode(204)
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async delete(
    @CurrentActor() actor: Actor,
    @Param('employeeId', resourceIdPipe) employeeId: string,
    @Param('absenceId', resourceIdPipe) absenceId: string,
  ): Promise<void> {
    await this.deleteAbsence.execute({
      organizationId: actor.organizationId,
      employeeId,
      absenceId,
    });
  }
}

/** Le contrat garantit des instants ISO 8601 avec décalage : la conversion ne peut pas échouer. */
function toPeriod(body: AbsenceRequestV1) {
  return {
    startsAt: Temporal.Instant.from(body.startsAt),
    endsAt: Temporal.Instant.from(body.endsAt),
    reason: body.reason,
  };
}
