/** La mémoire d'un conteneur à un instant, lue dans une ligne de `docker stats --format '{{json .}}'`. */
export interface MemorySample {
  container: string;
  usedBytes: number;
  limitBytes: number;
}

export interface MemoryPeak {
  peakBytes: number;
  limitBytes: number;
}

// Docker écrit les tailles en unités binaires (MiB), parfois décimales (MB).
const UNIT_BYTES: Record<string, number> = {
  B: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
  kB: 1000,
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4,
};
const SIZE = /^(\d+(?:\.\d+)?)([A-Za-z]+)$/;

export function bytesOf(size: string): number {
  const match = SIZE.exec(size.trim());
  const unitBytes = UNIT_BYTES[match?.[2] ?? ''];
  if (match === null || unitBytes === undefined) {
    throw new Error(`Taille illisible : ${size}.`);
  }
  return Number(match[1]) * unitBytes;
}

export function parseStatsLine(line: string): MemorySample {
  const stats = JSON.parse(line) as { Name: string; MemUsage: string };
  const [used = '', limit = ''] = stats.MemUsage.split('/');
  return { container: stats.Name, usedBytes: bytesOf(used), limitBytes: bytesOf(limit) };
}

/** Le maximum de mémoire observé de chaque conteneur : deux instantanés manqueraient une pointe. */
export class MemoryPeaks {
  private readonly peaks = new Map<string, MemoryPeak>();

  record(sample: MemorySample): void {
    const known = this.peaks.get(sample.container);
    if (known !== undefined && known.peakBytes >= sample.usedBytes) {
      return;
    }
    this.peaks.set(sample.container, {
      peakBytes: sample.usedBytes,
      limitBytes: sample.limitBytes,
    });
  }

  /** Les maxima, par nom de conteneur trié. */
  byContainer(): Record<string, MemoryPeak> {
    const result: Record<string, MemoryPeak> = {};
    for (const container of [...this.peaks.keys()].sort()) {
      const peak = this.peaks.get(container);
      if (peak !== undefined) {
        result[container] = peak;
      }
    }
    return result;
  }
}
