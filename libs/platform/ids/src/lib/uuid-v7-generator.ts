import type { Clock } from '@trame/platform/clock';
import { v7 } from 'uuid';
import type { IdGenerator } from './id-generator';

/**
 * UUID version 7 (RFC 9562) : les 48 premiers bits sont l'horodatage en millisecondes.
 * Les identifiants se trient donc dans leur ordre de création, ce qui permet de paginer par
 * identifiant seul. L'horodatage vient du port `Clock`, jamais de l'horloge système directement.
 */
export class UuidV7Generator implements IdGenerator {
  constructor(private readonly clock: Clock) {}

  next(): string {
    return v7({ msecs: this.clock.now().epochMilliseconds });
  }
}
