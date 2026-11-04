import { Module } from '@nestjs/common';
import {
  GetDiagnostic,
  StartDiagnostic,
  type DiagnosticRuns,
} from '@trame/api/scheduling/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import { DIAGNOSTIC_RUNS } from './diagnostic-runs.token';
import { DiagnosticsController } from './http/diagnostics.controller';
import { PrismaDiagnosticRuns } from './persistence/prisma-diagnostic-runs';

@Module({
  controllers: [DiagnosticsController],
  providers: [
    { provide: DIAGNOSTIC_RUNS, useClass: PrismaDiagnosticRuns },
    {
      provide: StartDiagnostic,
      inject: [DIAGNOSTIC_RUNS, CLOCK, ID_GENERATOR],
      useFactory: (runs: DiagnosticRuns, clock: Clock, ids: IdGenerator) =>
        new StartDiagnostic(runs, clock, ids),
    },
    {
      provide: GetDiagnostic,
      inject: [DIAGNOSTIC_RUNS],
      useFactory: (runs: DiagnosticRuns) => new GetDiagnostic(runs),
    },
  ],
})
export class SchedulingModule {}
