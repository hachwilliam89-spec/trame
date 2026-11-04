import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { evaluationCases, caseSetVersion } from './cases';
import { evaluateResults } from './lib/evaluate-results';

const inputSchema = z.strictObject({
  caseSetVersion: z.string(),
  observations: z.array(z.unknown()),
});

try {
  const [split, inputFile] = process.argv.slice(2);
  if (
    process.argv.length !== 4 ||
    (split !== 'calibration' && split !== 'evaluation') ||
    !inputFile
  ) {
    throw new Error('Usage : evaluate <calibration|evaluation> <résultats.json>');
  }
  const input = inputSchema.parse(JSON.parse(readFileSync(inputFile, 'utf8')));
  if (input.caseSetVersion !== caseSetVersion) {
    throw new Error(
      'Version de cas incompatible : ' +
        input.caseSetVersion +
        ' (attendue : ' +
        caseSetVersion +
        ').',
    );
  }
  const report = evaluateResults(evaluationCases, input.observations, split);
  console.log(JSON.stringify({ caseSetVersion: input.caseSetVersion, ...report }, null, 2));
  process.exitCode = report.failed === 0 ? 0 : 1;
} catch (error) {
  const message = error instanceof Error ? error.message : 'Erreur inattendue.';
  console.error('Évaluation impossible : ' + message);
  process.exitCode = 1;
}
