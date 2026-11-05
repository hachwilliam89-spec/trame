import { DIAGNOSTIC_PROGRESS } from '../lib/diagnostic-progress.token';
import { Test } from '@nestjs/testing';
import { InMemoryDiagnosticRuns } from '@trame/api/scheduling/application/testing';
import { AuthModule, type Actor } from '@trame/platform/auth';
import { testActorResolver } from '@trame/platform/auth/testing';
import { CLOCK, ClockModule, FixedClock } from '@trame/platform/clock';
import { ID_GENERATOR, IdsModule, SequentialIdGenerator } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { DIAGNOSTIC_RUNS } from '../lib/diagnostic-runs.token';
import { SchedulingModule } from '../lib/scheduling.module';

export const organizationA = '0190f0a0-0000-7000-8000-00000000000a';
export const organizationB = '0190f0a0-0000-7000-8000-00000000000b';
export const manager: Actor = {
  userId: '0190f0a0-0000-7000-8000-0000000000a1',
  organizationId: organizationA,
  roles: ['manager'],
};
export const admin: Actor = { ...manager, roles: ['admin'] };
export const employee: Actor = { ...manager, roles: ['employee'] };
export const otherManager: Actor = { ...manager, organizationId: organizationB };

export async function createSchedulingTestApp() {
  const runs = new InMemoryDiagnosticRuns();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ProblemDetailsModule,
      AuthModule.forRoot({ resolveActor: testActorResolver }),
      ClockModule,
      IdsModule,
      SchedulingModule,
    ],
  })
    .overrideProvider(DIAGNOSTIC_PROGRESS)
    .useValue({ read: async () => undefined, purgeFinishedBefore: async () => 0 })
    .overrideProvider(CLOCK)
    .useValue(new FixedClock('2026-11-04T10:00:00Z'))
    .overrideProvider(ID_GENERATOR)
    .useValue(new SequentialIdGenerator())
    .overrideProvider(DIAGNOSTIC_RUNS)
    .useValue(runs)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();
  return { app, runs };
}
