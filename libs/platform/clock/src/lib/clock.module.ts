import { Global, Module } from '@nestjs/common';
import { SystemClock } from './system-clock';

/** Jeton d'injection du port `Clock`. */
export const CLOCK = Symbol('CLOCK');

/** Fournit l'horloge système sous le jeton `CLOCK`. Les tests la remplacent par une `FixedClock`. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
