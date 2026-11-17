import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixedClock } from '@trame/platform/clock';
import { Liveness } from './liveness';

describe('Fichier de vie du relais', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'trame-relay-'));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('touche le fichier au premier tour, puis au plus toutes les 5 secondes', async () => {
    const file = join(directory, 'vivant');
    const clock = new FixedClock('2026-11-16T21:00:00Z');
    let writes = 0;
    const liveness = new Liveness(file, clock, async (path) => {
      writes += 1;
      await Liveness.touch(path);
    });

    await liveness.beat();
    await liveness.beat();
    expect(writes).toBe(1);
    expect(statSync(file).isFile()).toBe(true);

    clock.advance({ seconds: 5 });
    await liveness.beat();
    expect(writes).toBe(2);
  });
});
