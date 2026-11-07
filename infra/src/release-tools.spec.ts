import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * oras et cosign sont installés sur le VPS (infra/staging/install-release-tools.sh) aux versions et
 * sommes de contrôle de la CI qui publie et signe les versions (.github/actions/release-tools) :
 * le VPS vérifie avec les outils qui ont produit les signatures.
 */
const VPS_INSTALLER = join(__dirname, '../staging/install-release-tools.sh');
const CI_RELEASE_TOOLS = join(__dirname, '../../.github/actions/release-tools/action.yml');
const PINNED_VALUES = ['COSIGN_VERSION', 'COSIGN_SHA256', 'ORAS_VERSION', 'ORAS_SHA256'];

/** Valeur d'une variable, écrite `NOM: valeur` (YAML) ou `readonly NOM='valeur'` (shell). */
function pinnedValue(text: string, name: string): string | undefined {
  const pattern = new RegExp(`^\\s*(?:readonly\\s+)?${name}(?::\\s*|=)'?([^'\\s]+)'?\\s*$`, 'm');
  return pattern.exec(text)?.[1];
}

describe('outils de vérification des versions sur le VPS (US-005 B2a)', () => {
  it.each(PINNED_VALUES)('installe %s comme la CI qui signe', (name) => {
    const ciValue = pinnedValue(readFileSync(CI_RELEASE_TOOLS, 'utf8'), name);
    const vpsValue = pinnedValue(readFileSync(VPS_INSTALLER, 'utf8'), name);

    expect(ciValue).toMatch(/^\S+$/);
    expect(vpsValue).toBe(ciValue);
  });
});
