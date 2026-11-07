import { setTimeout as delay } from 'node:timers/promises';
import { runCommand } from './command';
import { type MemoryPeak, MemoryPeaks, parseStatsLine } from './memory-peaks';

export const REHEARSED_PROJECTS = ['trame-shared', 'trame-staging'];
const SAMPLING_INTERVAL_MILLISECONDS = 2_000;

/**
 * Relève `docker stats` toutes les 2 secondes, du début à la fin du parcours, et garde le maximum
 * de chaque conteneur des stacks de Trame. `--no-stream` ne donne qu'une mesure par appel : c'est
 * la boucle qui rend le relevé continu.
 */
export class MemorySampler {
  private readonly peaks = new MemoryPeaks();
  private running = false;
  private loop: Promise<void> = Promise.resolve();
  private failedSamples = 0;

  start(): void {
    this.running = true;
    this.loop = this.sampleUntilStopped();
  }

  async stop(): Promise<{ peaks: Record<string, MemoryPeak>; failedSamples: number }> {
    this.running = false;
    await this.loop;
    return { peaks: this.peaks.byContainer(), failedSamples: this.failedSamples };
  }

  private async sampleUntilStopped(): Promise<void> {
    while (this.running) {
      try {
        await this.sampleOnce();
      } catch {
        // Un conteneur recréé pendant la mesure la fait échouer : la suivante le retrouve.
        this.failedSamples += 1;
      }
      await delay(SAMPLING_INTERVAL_MILLISECONDS);
    }
  }

  private async sampleOnce(): Promise<void> {
    const output = await runCommand('docker', ['stats', '--no-stream', '--format', '{{json .}}']);
    for (const line of output.split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      const sample = parseStatsLine(line);
      if (isRehearsedContainer(sample.container)) {
        this.peaks.record(sample);
      }
    }
  }
}

function isRehearsedContainer(name: string): boolean {
  return REHEARSED_PROJECTS.some((project) => name.startsWith(`${project}-`));
}

/** Les conteneurs des stacks de Trame, en cours ou arrêtés. */
export async function rehearsedContainers(): Promise<string[]> {
  const containers: string[] = [];
  for (const project of REHEARSED_PROJECTS) {
    const output = await runCommand('docker', [
      'ps',
      '--all',
      '--quiet',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ]);
    containers.push(...output.split('\n').filter((id) => id !== ''));
  }
  return containers;
}
