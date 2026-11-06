import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const VERIFY_RELEASE_SCRIPT = join(__dirname, '../../verify-release.sh');

/** Chaque appel est noté sur une ligne, ses arguments séparés par des tabulations. */
const RECORD_CALL = `{ printf '%s\\t' "$(basename "$0")" "$@"; printf '\\n'; } >> "$FAKE_STATE/calls"`;

const FAKE_ORAS = `#!/usr/bin/env bash
set -eu
${RECORD_CALL}
case "$1" in
  resolve)
    if [ -f "$FAKE_STATE/resolve-error" ]; then cat "$FAKE_STATE/resolve-error" >&2; exit 1; fi
    cat "$FAKE_STATE/resolve-output"
    ;;
  pull)
    cp "$FAKE_STATE/images.json" "$4/images.json"
    ;;
  *)
    echo "appel inattendu : oras $*" >&2
    exit 64
    ;;
esac
`;

const FAKE_COSIGN = `#!/usr/bin/env bash
set -eu
${RECORD_CALL}
reference="\${!#}"
if [ -f "$FAKE_STATE/refused" ] && grep -qxF "$reference" "$FAKE_STATE/refused"; then
  echo 'Error: no matching signatures' >&2
  exit 1
fi
echo '[]'
`;

export interface VerificationRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Faux `oras` et `cosign` pour le vérificateur shell, placés devant le PATH. Un `oras` ou un
 * `cosign` réellement installé sur le poste est retiré du PATH, pour que seul le faux réponde.
 */
export class FakeReleaseTools {
  private readonly root = mkdtempSync(join(tmpdir(), 'verify-release-'));
  private readonly binDirectory = join(this.root, 'bin');
  private readonly stateDirectory = join(this.root, 'state');
  readonly digestsFile = join(this.root, 'release.env');

  constructor() {
    mkdirSync(this.binDirectory);
    mkdirSync(this.stateDirectory);
    this.install('oras', FAKE_ORAS);
    this.install('cosign', FAKE_COSIGN);
  }

  resolvesTo(output: string): this {
    writeFileSync(join(this.stateDirectory, 'resolve-output'), output);
    return this;
  }

  failsToResolve(message: string): this {
    writeFileSync(join(this.stateDirectory, 'resolve-error'), message);
    return this;
  }

  publishes(manifestText: string): this {
    writeFileSync(join(this.stateDirectory, 'images.json'), manifestText);
    return this;
  }

  refusesSignatureOf(reference: string): this {
    writeFileSync(join(this.stateDirectory, 'refused'), `${reference}\n`, { flag: 'a' });
    return this;
  }

  without(tool: 'oras' | 'cosign'): this {
    rmSync(join(this.binDirectory, tool));
    return this;
  }

  verify(commit: string): VerificationRun {
    const result = spawnSync('bash', [VERIFY_RELEASE_SCRIPT, commit, this.digestsFile], {
      encoding: 'utf8',
      env: { PATH: this.searchPath(), FAKE_STATE: this.stateDirectory },
      timeout: 30_000,
    });
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  /** Les appels reçus par les faux outils, chacun sous la forme [outil, ...arguments]. */
  calls(): string[][] {
    const callsFile = join(this.stateDirectory, 'calls');
    if (!existsSync(callsFile)) {
      return [];
    }
    const lines = readFileSync(callsFile, 'utf8')
      .split('\n')
      .filter((line) => line !== '');
    return lines.map((line) => line.replace(/\t$/, '').split('\t'));
  }

  writtenDigests(): string | undefined {
    if (!existsSync(this.digestsFile)) {
      return undefined;
    }
    return readFileSync(this.digestsFile, 'utf8');
  }

  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }

  private install(tool: string, script: string): void {
    const path = join(this.binDirectory, tool);
    writeFileSync(path, script);
    chmodSync(path, 0o755);
  }

  private searchPath(): string {
    const systemDirectories = (process.env['PATH'] ?? '').split(delimiter);
    const kept = [this.binDirectory];
    for (const directory of systemDirectories) {
      const hasRealTool =
        existsSync(join(directory, 'oras')) || existsSync(join(directory, 'cosign'));
      if (directory !== '' && !hasRealTool) {
        kept.push(directory);
      }
    }
    return kept.join(delimiter);
  }
}
