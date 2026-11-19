import { DemandModule } from '@trame/api/demand/infrastructure';
import { DemandSiteCatalogModule } from './demand-site-catalog.module';

/**
 * Définition unique du contexte `demand`, dans un fichier à part : les adaptateurs de `staff` et
 * de `scheduling` l'importent sans former de boucle avec `context-modules.ts`.
 */
export const demandModule = DemandModule.forRoot({ siteCatalog: DemandSiteCatalogModule });
