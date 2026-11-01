import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ProblemDetailsFilter } from './problem-details.filter';

/** Enregistre `ProblemDetailsFilter` comme filtre global de l'application. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class ProblemDetailsModule {}
