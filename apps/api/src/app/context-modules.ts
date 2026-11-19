import { StaffModule } from '@trame/api/staff/infrastructure';
import { demandModule } from './demand/demand-context';
import { StaffOrganizationCatalogModule } from './staff/staff-organization-catalog.module';
import { StaffPlanningReferenceModule } from './staff/staff-planning-reference.module';

/**
 * Une seule définition de chaque contexte paramétré : l'application et les adaptateurs entre
 * contextes importent la même, donc une seule instance de ses use cases.
 */
export const staffModule = StaffModule.forRoot({
  organizationCatalog: StaffOrganizationCatalogModule,
  planningReference: StaffPlanningReferenceModule,
});

export { demandModule };
