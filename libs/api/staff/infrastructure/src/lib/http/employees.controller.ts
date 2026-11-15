import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { GetEmployee, ListEmployees } from '@trame/api/staff/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type EmployeeListQueryV1,
  type EmployeePageV1,
  type EmployeeV1,
  employeeListQueryV1,
  roleV1,
} from '@trame/shared/contracts';
import { toPageRequest } from './page-request';
import { toEmployeeV1 } from './presenters';
import { resourceIdPipe } from './resource-id.pipe';
import { staffErrorMappings } from './staff-error-mappings';

/**
 * Lecture des employés par un admin ou un manager de leur organisation. L'écriture par HTTP
 * viendra avec l'écran de gestion (US-031) ; d'ici là, les employés sont créés par use case.
 */
@Controller('employees')
@UseInterceptors(new ErrorMappingInterceptor(staffErrorMappings))
export class EmployeesController {
  constructor(
    private readonly getEmployee: GetEmployee,
    private readonly listEmployees: ListEmployees,
  ) {}

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(employeeListQueryV1)) query: EmployeeListQueryV1,
  ): Promise<EmployeePageV1> {
    const page = await this.listEmployees.execute({
      organizationId: actor.organizationId,
      siteId: query.siteId,
      page: toPageRequest(query),
    });
    return { items: page.items.map(toEmployeeV1), nextCursor: page.nextCursor };
  }

  @Get(':employeeId')
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async get(
    @CurrentActor() actor: Actor,
    @Param('employeeId', resourceIdPipe) employeeId: string,
  ): Promise<EmployeeV1> {
    const employee = await this.getEmployee.execute({
      organizationId: actor.organizationId,
      employeeId,
    });
    return toEmployeeV1(employee);
  }
}
