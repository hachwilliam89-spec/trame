import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..');
const TSX = join(REPOSITORY_ROOT, 'node_modules/.bin/tsx');
const MAIN = join(import.meta.dirname, 'main.ts');

/**
 * Exécutable `gh` factice : il note chacun de ses appels, et rend une PR dont le check CI OK
 * a échoué. Aucune requête n'atteint GitHub.
 */
const FAKE_GH_SCRIPT = `#!/bin/sh
echo "$*" >> "$FAKE_GH_LOG"
case "$1 $2" in
  "api "*) echo '["CI OK","CodeQL"]' ;;
  "pr view") echo '{"number":22,"state":"OPEN","isDraft":false,"baseRefName":"main","headRefName":"feat/x","headRefOid":"aaaa1111","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}' ;;
  "pr checks") echo '[{"name":"CI OK","bucket":"fail"},{"name":"CodeQL","bucket":"pass"}]'; exit 1 ;;
  *) echo "appel inattendu : $*" >&2; exit 1 ;;
esac
`;

describe('pnpm pr:merge, avec un exécutable gh factice', () => {
  let fakeBinDirectory: string;

  beforeEach(() => {
    fakeBinDirectory = mkdtempSync(join(tmpdir(), 'merge-pr-bin-'));
    const fakeGh = join(fakeBinDirectory, 'gh');
    writeFileSync(fakeGh, FAKE_GH_SCRIPT);
    chmodSync(fakeGh, 0o755);
  });

  afterEach(() => {
    rmSync(fakeBinDirectory, { recursive: true, force: true });
  });

  it('sort en erreur sans fusionner quand un check requis a échoué', () => {
    const log = join(fakeBinDirectory, 'calls.log');

    const result = spawnSync(TSX, [MAIN, '22'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBinDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
        FAKE_GH_LOG: log,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "pr:merge · arrêt, rien n'a été fusionné. Checks requis non réussis : CI OK",
    );
    const calls = readFileSync(log, 'utf8');
    expect(calls).toContain('pr checks 22 --json name,bucket');
    expect(calls).not.toContain('pr merge');
  });
});
