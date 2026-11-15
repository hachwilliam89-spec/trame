import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ListContracts } from '@trame/api/staff/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type EmploymentContractPageV1,
  type PageQueryV1,
  pageQueryV1,
  roleV1,
} from '@trame/shared/contracts';
import { toPageRequest } from './page-request';
import { toEmploymentContractV1 } from './presenters';
import { resourceIdPipe } from './resource-id.pipe';
import { staffErrorMappings } from './staff-error-mappings';

/**
 * Lecture des contrats de travail d'un employé, par un admin ou un manager de son organisation.
 * L'écriture par HTTP viendra avec l'écran de gestion (US-032).
 */
@Controller('employees/:employeeId/contracts')
@UseInterceptors(new ErrorMappingInterceptor(staffErrorMappings))
export class EmploymentContractsController {
  constructor(private readonly listContracts: ListContracts) {}

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Param('employeeId', resourceIdPipe) employeeId: string,
    @Query(new ZodValidationPipe(pageQueryV1)) query: PageQueryV1,
  ): Promise<EmploymentContractPageV1> {
    const page = await this.listContracts.execute({
      organizationId: actor.organizationId,
      employeeId,
      page: toPageRequest(query),
    });
    return { items: page.items.map(toEmploymentContractV1), nextCursor: page.nextCursor };
  }
}
