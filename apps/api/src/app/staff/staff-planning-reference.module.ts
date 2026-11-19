import { Module } from '@nestjs/common';
import { OrganizationModule } from '@trame/api/organization/infrastructure';
import { ScheduleReadModule } from '@trame/api/scheduling/infrastructure';
import { PLANNING_REFERENCE_SOURCE } from '@trame/api/staff/infrastructure';
import { demandModule } from '../demand/demand-context';
import { PlanningReferenceAdapter } from './planning-reference.adapter';

/**
 * Fournit au contexte `staff` son port vers `scheduling`, `organization` et `demand`, pour figer
 * la référence d'une absence (US-033). `ScheduleReadModule` n'importe pas `staff` : pas de boucle.
 */
@Module({
  imports: [ScheduleReadModule, OrganizationModule, demandModule],
  providers: [{ provide: PLANNING_REFERENCE_SOURCE, useClass: PlanningReferenceAdapter }],
  exports: [PLANNING_REFERENCE_SOURCE],
})
export class StaffPlanningReferenceModule {}
