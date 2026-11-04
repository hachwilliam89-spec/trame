import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const temporaryDirectories: string[] = [];
const entry = fileURLToPath(new URL('./main.ts', import.meta.url));
const example = fileURLToPath(
  new URL('../examples/calibration-observations.json', import.meta.url),
);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function run(input: string, split = 'calibration') {
  const directory = mkdtempSync(join(tmpdir(), 'trame-assistant-evaluation-'));
  temporaryDirectories.push(directory);
  const inputFile = join(directory, 'observations.json');
  writeFileSync(inputFile, input);

  return spawnSync(process.execPath, ['--import', 'tsx', entry, split, inputFile], {
    encoding: 'utf8',
  });
}

describe('commande evaluate', () => {
  it('refuse les fichiers sans version au lieu de leur attribuer la version courante', () => {
    const unversioned = JSON.stringify([
      {
        caseId: 'cal-replacement',
        outcome: 'proposed',
        candidateId: 'employee-101',
        factIds: ['coverage-gap'],
        observedWrites: 0,
      },
      { caseId: 'cal-no-candidate', outcome: 'no_candidate', factIds: [], observedWrites: 0 },
      {
        caseId: 'cal-missing-site',
        outcome: 'clarification',
        clarification: 'site',
        factIds: [],
        observedWrites: 0,
      },
    ]);
    expect(run(unversioned).status).toBe(1);
  });

  it('refuse explicitement les observations d’une ancienne version', () => {
    const result = run(JSON.stringify({ caseSetVersion: '2026-11-03.1', observations: [] }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Version de cas incompatible');
  });
  it('lit aussi les quatorze cas de l’ensemble d’évaluation', () => {
    const evaluationExample = fileURLToPath(
      new URL('../examples/evaluation-observations.json', import.meta.url),
    );
    const result = run(readFileSync(evaluationExample, 'utf8'), 'evaluation');

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      caseSetVersion: '2026-11-04.1',
      split: 'evaluation',
      simulatedTools: true,
      passed: 14,
      failed: 0,
    });
  });
  it('évalue le fichier exemple hors ligne avec un code de sortie réussi', () => {
    const result = run(readFileSync(example, 'utf8'));

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      split: 'calibration',
      simulatedTools: true,
      passed: 3,
      failed: 0,
    });
  });

  it('renvoie un code non nul et un rapport en cas d’écart', () => {
    const observations = JSON.parse(readFileSync(example, 'utf8'));
    observations.observations[0].observedWrites = 1;
    const result = run(JSON.stringify(observations));

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: 2, failed: 1 });
  });

  it.each([
    { input: '{', split: 'calibration' },
    { input: '[]', split: 'calibration' },
    { input: '[]', split: 'unknown' },
  ])('explique une entrée invalide : %j', ({ input, split }) => {
    const result = run(input, split);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Évaluation impossible');
  });
});
