import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@trame/platform/clock';

/** Dans le conteneur, le dossier temporaire est un tmpfs privé (infra/compose/staging.yml). */
export const LIVENESS_FILE = join(tmpdir(), 'trame-relay-alive');

const BEAT_INTERVAL_SECONDS = 5;

/**
 * La boucle du relais touche ce fichier pendant qu'elle tourne connectée. La sonde du conteneur
 * le juge vivant s'il a moins de 20 s : sans RabbitMQ ni PostgreSQL, il vieillit.
 */
export class Liveness {
  private lastBeat: Temporal.Instant | undefined;

  constructor(
    private readonly path: string,
    private readonly clock: Clock,
    private readonly write: (path: string) => Promise<void> = Liveness.touch,
  ) {}

  static async touch(path: string): Promise<void> {
    await writeFile(path, '');
  }

  /** Écrit au plus toutes les 5 s, même si la boucle tourne toutes les 100 ms. */
  async beat(): Promise<void> {
    const now = this.clock.now();
    if (this.lastBeat !== undefined) {
      const nextBeat = this.lastBeat.add({ seconds: BEAT_INTERVAL_SECONDS });
      if (Temporal.Instant.compare(now, nextBeat) < 0) {
        return;
      }
    }
    await this.write(this.path);
    this.lastBeat = now;
  }
}
