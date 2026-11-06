/**
 * Génère les realms déployés (`infra/keycloak/generated/<realm>-realm.json`) à partir du realm local.
 * Lancé par `pnpm nx run infra:realms-generate` ; le test d'écart de `environment-realm.spec.ts`
 * échoue si un fichier versionné ne correspond plus.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPLOYED_REALMS,
  buildEnvironmentRealm,
  serializeRealm,
} from '../src/lib/environment-realm';

const keycloakDirectory = join(import.meta.dirname, '../keycloak');
const localRealm = JSON.parse(readFileSync(join(keycloakDirectory, 'trame-realm.json'), 'utf8'));

for (const environment of Object.values(DEPLOYED_REALMS)) {
  const path = join(keycloakDirectory, 'generated', `${environment.realmName}-realm.json`);
  writeFileSync(path, serializeRealm(buildEnvironmentRealm(localRealm, environment)));
  console.log(`Realm généré : ${path}`);
}
