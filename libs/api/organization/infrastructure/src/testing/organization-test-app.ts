import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  InMemoryShiftTemplateRepository,
  InMemorySiteRepository,
  InMemoryPositionRepository,
  InMemorySkillRepository,
} from '@trame/api/organization/application/testing';
import { AuthModule } from '@trame/platform/auth';
import { testActorResolver } from '@trame/platform/auth/testing';
import { CLOCK, ClockModule, FixedClock } from '@trame/platform/clock';
import { ID_GENERATOR, IdsModule, SequentialIdGenerator } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import { OrganizationModule } from '../lib/organization.module';
import {
  POSITION_REPOSITORY,
  SHIFT_TEMPLATE_REPOSITORY,
  SITE_REPOSITORY,
  SKILL_REPOSITORY,
} from '../lib/repository-tokens';

/** Instant fixe de l'horloge des tests HTTP. */
export const TEST_NOW = Temporal.Instant.from('2026-11-02T08:00:00Z');

/**
 * Application de test du contexte, avec des dépôts en mémoire, une horloge fixe et des
 * identifiants prévisibles. L'utilisateur vient de l'en-tête `x-test-actor`.
 */
export async function createOrganizationTestApp(): Promise<INestApplication> {
  const positions = new InMemoryPositionRepository();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ProblemDetailsModule,
      AuthModule.forRoot({ resolveActor: testActorResolver }),
      ClockModule,
      IdsModule,
      OrganizationModule,
    ],
  })
    .overrideProvider(CLOCK)
    .useValue(new FixedClock(TEST_NOW))
    .overrideProvider(ID_GENERATOR)
    .useValue(new SequentialIdGenerator())
    .overrideProvider(SITE_REPOSITORY)
    .useValue(new InMemorySiteRepository())
    .overrideProvider(SHIFT_TEMPLATE_REPOSITORY)
    .useValue(new InMemoryShiftTemplateRepository())
    .overrideProvider(POSITION_REPOSITORY)
    .useValue(positions)
    .overrideProvider(SKILL_REPOSITORY)
    .useValue(new InMemorySkillRepository(positions))
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}
