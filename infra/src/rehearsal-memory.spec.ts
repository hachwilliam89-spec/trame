import { MemoryPeaks, bytesOf, parseStatsLine } from './lib/rehearsal/memory-peaks';

/**
 * Relevés de mémoire de la répétition du staging (US-005 B2a, étape 4) : `docker stats` est lu en
 * continu, et seul le maximum observé de chaque conteneur est gardé.
 */
const MIB = 1024 * 1024;

function statsLine(name: string, usage: string): string {
  return JSON.stringify({ Name: name, MemUsage: usage, CPUPerc: '1.00%' });
}

describe('relevés de mémoire de la répétition', () => {
  it.each([
    ['0B', 0],
    ['512KiB', 512 * 1024],
    ['45.5MiB', 45.5 * MIB],
    ['1.25GiB', 1.25 * 1024 * MIB],
    ['1kB', 1000],
    ['2.5MB', 2_500_000],
  ])('lit la taille %s', (size, bytes) => {
    expect(bytesOf(size)).toBe(bytes);
  });

  it('refuse une taille illisible', () => {
    expect(() => bytesOf('beaucoup')).toThrow('Taille illisible : beaucoup.');
  });

  it('lit l’usage et la limite d’un conteneur', () => {
    expect(parseStatsLine(statsLine('trame-staging-api-1', '120MiB / 384MiB'))).toEqual({
      container: 'trame-staging-api-1',
      usedBytes: 120 * MIB,
      limitBytes: 384 * MIB,
    });
  });

  it('garde le maximum observé de chaque conteneur, et sa limite', () => {
    const peaks = new MemoryPeaks();

    peaks.record(parseStatsLine(statsLine('trame-staging-api-1', '120MiB / 384MiB')));
    peaks.record(parseStatsLine(statsLine('trame-staging-api-1', '300MiB / 384MiB')));
    peaks.record(parseStatsLine(statsLine('trame-staging-api-1', '200MiB / 384MiB')));
    peaks.record(parseStatsLine(statsLine('trame-shared-postgres-1', '80MiB / 1.5GiB')));

    expect(peaks.byContainer()).toEqual({
      'trame-shared-postgres-1': { peakBytes: 80 * MIB, limitBytes: 1.5 * 1024 * MIB },
      'trame-staging-api-1': { peakBytes: 300 * MIB, limitBytes: 384 * MIB },
    });
  });
});
