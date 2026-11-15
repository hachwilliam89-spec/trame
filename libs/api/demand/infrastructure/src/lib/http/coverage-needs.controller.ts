import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { GetWeeklyCoverage } from '@trame/api/demand/application';
import { type Actor, CurrentActor, RequireRoles } from '@trame/platform/auth';
import { ErrorMappingInterceptor } from '@trame/platform/problem-details';
import { ZodValidationPipe } from '@trame/platform/zod-validation';
import {
  type WeeklyCoverageQueryV1,
  type WeeklyCoverageV1,
  roleV1,
  weeklyCoverageQueryV1,
} from '@trame/shared/contracts';
import { demandErrorMappings } from './demand-error-mappings';
import { toWeeklyCoverageV1, undefinedWeeklyCoverageV1 } from './presenters';

/**
 * Lecture des besoins de couverture d'un site pour une semaine, par un admin ou un manager de
 * son organisation. L'écriture par HTTP viendra avec l'écran de gestion (US-050).
 */
@Controller('coverage-needs')
@UseInterceptors(new ErrorMappingInterceptor(demandErrorMappings))
export class CoverageNeedsController {
  constructor(private readonly getWeeklyCoverage: GetWeeklyCoverage) {}

  @Get()
  @RequireRoles(roleV1.enum.admin, roleV1.enum.manager)
  async get(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(weeklyCoverageQueryV1)) query: WeeklyCoverageQueryV1,
  ): Promise<WeeklyCoverageV1> {
    const weekStartsOn = Temporal.PlainDate.from(query.weekStartsOn);
    const coverage = await this.getWeeklyCoverage.execute({
      organizationId: actor.organizationId,
      siteId: query.siteId,
      weekStartsOn,
    });
    if (coverage === undefined) {
      return undefinedWeeklyCoverageV1(query.siteId, weekStartsOn);
    }
    return toWeeklyCoverageV1(coverage);
  }
}
