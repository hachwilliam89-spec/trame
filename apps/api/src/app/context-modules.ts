import { DemandModule } from '@trame/api/demand/infrastructure';
import { StaffModule } from '@trame/api/staff/infrastructure';
import { DemandSiteCatalogModule } from './demand/demand-site-catalog.module';
import { StaffOrganizationCatalogModule } from './staff/staff-organization-catalog.module';

/**
 * Une seule définition de chaque contexte paramétré : l'application et les adaptateurs entre
 * contextes importent la même, donc une seule instance de ses use cases.
 */
export const staffModule = StaffModule.forRoot({
  organizationCatalog: StaffOrganizationCatalogModule,
});

export const demandModule = DemandModule.forRoot({ siteCatalog: DemandSiteCatalogModule });
