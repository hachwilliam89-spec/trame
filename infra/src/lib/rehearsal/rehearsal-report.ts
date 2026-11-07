import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryPeak } from './memory-peaks';

export interface RehearsedVersion {
  commit: string;
  /** Les six TRAME_<IMAGE>_DIGEST vérifiés par deploy.sh, tels qu'écrits sur l'hôte. */
  digests: string;
}

/** La preuve d'une répétition : ce qui a été joué, avec quoi, et ce qui a été observé. */
export interface RehearsalReport {
  scriptCommit: string;
  target?: RehearsedVersion;
  previous?: RehearsedVersion;
  tools: Record<string, string>;
  steps: { name: string; outcome: string }[];
  memoryPeaks: Record<string, MemoryPeak>;
  failedMemorySamples: number;
  /** Événements Docker des stacks de Trame lus pendant le parcours : zéro trahirait un flux vide. */
  observedContainerEvents: number;
  incidents: string[];
}

const MIB = 1024 * 1024;

export async function writeRehearsalReport(
  directory: string,
  report: RehearsalReport,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'repetition.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(directory, 'repetition.md'), markdownOf(report));
}

function markdownOf(report: RehearsalReport): string {
  const lines = [
    '## Répétition du staging',
    '',
    `- Script répété : \`${report.scriptCommit}\``,
    `- Version visée : \`${report.target?.commit ?? 'non choisie'}\``,
    `- Version précédente : \`${report.previous?.commit ?? 'non choisie'}\``,
  ];
  for (const [tool, version] of Object.entries(report.tools)) {
    lines.push(`- ${tool} : ${version}`);
  }
  lines.push('', '| Étape | Issue |', '| --- | --- |');
  for (const step of report.steps) {
    lines.push(`| ${step.name} | ${step.outcome} |`);
  }
  lines.push('', '| Conteneur | Maximum observé | Limite |', '| --- | --- | --- |');
  for (const [container, peak] of Object.entries(report.memoryPeaks)) {
    lines.push(
      `| ${container} | ${(peak.peakBytes / MIB).toFixed(0)} Mio | ${(peak.limitBytes / MIB).toFixed(0)} Mio |`,
    );
  }
  const incidents = report.incidents.length === 0 ? ['aucun'] : report.incidents;
  lines.push(
    '',
    `Incidents : ${incidents.join(' ; ')} (${String(report.observedContainerEvents)} événements Docker lus).`,
    '',
  );
  return lines.join('\n');
}
