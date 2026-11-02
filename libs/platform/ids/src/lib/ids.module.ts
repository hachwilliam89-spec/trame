import { Global, Module } from '@nestjs/common';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { UuidV7Generator } from './uuid-v7-generator';

/** Jeton d'injection du port `IdGenerator`. */
export const ID_GENERATOR = Symbol('ID_GENERATOR');

/** Fournit un générateur d'UUID v7 sous le jeton `ID_GENERATOR`. Nécessite `ClockModule`. */
@Global()
@Module({
  providers: [
    {
      provide: ID_GENERATOR,
      inject: [CLOCK],
      useFactory: (clock: Clock) => new UuidV7Generator(clock),
    },
  ],
  exports: [ID_GENERATOR],
})
export class IdsModule {}
