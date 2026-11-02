import type { Provider } from '@nestjs/common';
import {
  CreatePosition,
  CreateSkill,
  DeleteSkill,
  GetPosition,
  GetSkill,
  ListPositions,
  ListSkills,
  type PositionRepository,
  type SiteRepository,
  type SkillRepository,
} from '@trame/api/organization/application';
import { CLOCK, type Clock } from '@trame/platform/clock';
import { ID_GENERATOR, type IdGenerator } from '@trame/platform/ids';
import { PrismaPositionRepository } from './persistence/prisma-position.repository';
import { PrismaSkillRepository } from './persistence/prisma-skill.repository';
import { POSITION_REPOSITORY, SITE_REPOSITORY, SKILL_REPOSITORY } from './repository-tokens';

export const catalogProviders: Provider[] = [
  { provide: SKILL_REPOSITORY, useClass: PrismaSkillRepository },
  { provide: POSITION_REPOSITORY, useClass: PrismaPositionRepository },
  {
    provide: CreateSkill,
    inject: [SKILL_REPOSITORY, CLOCK, ID_GENERATOR],
    useFactory: (skills: SkillRepository, clock: Clock, ids: IdGenerator) =>
      new CreateSkill(skills, clock, ids),
  },
  {
    provide: GetSkill,
    inject: [SKILL_REPOSITORY],
    useFactory: (skills: SkillRepository) => new GetSkill(skills),
  },
  {
    provide: ListSkills,
    inject: [SKILL_REPOSITORY],
    useFactory: (skills: SkillRepository) => new ListSkills(skills),
  },
  {
    provide: DeleteSkill,
    inject: [SKILL_REPOSITORY],
    useFactory: (skills: SkillRepository) => new DeleteSkill(skills),
  },
  {
    provide: CreatePosition,
    inject: [SITE_REPOSITORY, SKILL_REPOSITORY, POSITION_REPOSITORY, CLOCK, ID_GENERATOR],
    useFactory: (
      sites: SiteRepository,
      skills: SkillRepository,
      positions: PositionRepository,
      clock: Clock,
      ids: IdGenerator,
    ) => new CreatePosition(sites, skills, positions, clock, ids),
  },
  {
    provide: GetPosition,
    inject: [SITE_REPOSITORY, POSITION_REPOSITORY],
    useFactory: (sites: SiteRepository, positions: PositionRepository) =>
      new GetPosition(sites, positions),
  },
  {
    provide: ListPositions,
    inject: [SITE_REPOSITORY, POSITION_REPOSITORY],
    useFactory: (sites: SiteRepository, positions: PositionRepository) =>
      new ListPositions(sites, positions),
  },
];
