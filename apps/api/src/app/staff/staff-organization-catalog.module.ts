import { Module } from '@nestjs/common';
import { OrganizationModule } from '@trame/api/organization/infrastructure';
import { ORGANIZATION_CATALOG } from '@trame/api/staff/infrastructure';
import { OrganizationCatalogAdapter } from './organization-catalog.adapter';

/** Fournit au contexte `staff` son port vers le contexte `organization`. */
@Module({
  imports: [OrganizationModule],
  providers: [{ provide: ORGANIZATION_CATALOG, useClass: OrganizationCatalogAdapter }],
  exports: [ORGANIZATION_CATALOG],
})
export class StaffOrganizationCatalogModule {}
