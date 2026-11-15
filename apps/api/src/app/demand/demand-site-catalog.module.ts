import { Module } from '@nestjs/common';
import { SITE_CATALOG } from '@trame/api/demand/infrastructure';
import { OrganizationModule } from '@trame/api/organization/infrastructure';
import { SiteCatalogAdapter } from './site-catalog.adapter';

/** Fournit au contexte `demand` son port vers le contexte `organization`. */
@Module({
  imports: [OrganizationModule],
  providers: [{ provide: SITE_CATALOG, useClass: SiteCatalogAdapter }],
  exports: [SITE_CATALOG],
})
export class DemandSiteCatalogModule {}
