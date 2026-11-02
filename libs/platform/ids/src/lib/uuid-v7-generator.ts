import { randomInt } from 'node:crypto';
import type { Clock } from '@trame/platform/clock';
import { v7 } from 'uuid';
import type { IdGenerator } from './id-generator';

/** Le compteur occupe 32 bits après l'horodatage. Il démarre sur 31 bits pour garder de la marge. */
const MAX_SEQUENCE = 0xffff_ffff;
const MAX_INITIAL_SEQUENCE = 0x7fff_ffff;

/**
 * UUID version 7 (RFC 9562) : les 48 premiers bits sont l'horodatage en millisecondes, suivis
 * d'un compteur. Les identifiants d'une même instance se trient dans leur ordre de création, même
 * à la même milliseconde, ce qui permet de paginer par identifiant seul.
 *
 * L'horodatage vient du port `Clock`. Passer `msecs` à `uuid` désactive son compteur interne :
 * ce générateur tient donc le sien (RFC 9562, §6.2, méthode 1).
 */
export class UuidV7Generator implements IdGenerator {
  private lastMilliseconds = Number.NEGATIVE_INFINITY;
  private sequence = 0;

  constructor(private readonly clock: Clock) {}

  next(): string {
    this.advance(this.clock.now().epochMilliseconds);
    return v7({ msecs: this.lastMilliseconds, seq: this.sequence });
  }

  /**
   * - Nouvelle milliseconde : compteur tiré au hasard, pour limiter les collisions entre instances.
   * - Même milliseconde, ou horloge qui recule : compteur + 1 sur la dernière milliseconde, pour
   *   ne jamais produire un identifiant plus petit que le précédent.
   * - Compteur épuisé : passage à la milliseconde suivante.
   */
  private advance(nowMilliseconds: number): void {
    if (nowMilliseconds > this.lastMilliseconds) {
      this.lastMilliseconds = nowMilliseconds;
      this.sequence = randomInt(MAX_INITIAL_SEQUENCE + 1);
      return;
    }

    this.sequence += 1;
    if (this.sequence > MAX_SEQUENCE) {
      this.lastMilliseconds += 1;
      this.sequence = 0;
    }
  }
}
