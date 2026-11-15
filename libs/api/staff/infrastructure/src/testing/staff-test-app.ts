import { type DynamicModule, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreateContract, CreateEmployee } from '@trame/api/staff/application';
import {
  InMemoryContractRepository,
  InMemoryEmployeeRepository,
  InMemoryOrganizationCatalog,
} from '@trame/api/staff/application/testing';
import { type Actor, AuthModule } from '@trame/platform/auth';
import {
  TEST_ACTOR_HEADER,
  testActorHeader,
  testActorResolver,
} from '@trame/platform/auth/testing';
import { CLOCK, ClockModule, FixedClock } from '@trame/platform/clock';
import { ID_GENERATOR, IdsModule, SequentialIdGenerator } from '@trame/platform/ids';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import request from 'supertest';
import {
  CONTRACT_REPOSITORY,
  EMPLOYEE_REPOSITORY,
  ORGANIZATION_CATALOG,
} from '../lib/injection-tokens';
import { StaffModule } from '../lib/staff.module';

export const ORGANIZATION_A = '0190f0a0-0000-7000-8000-00000000000a';
export const ORGANIZATION_B = '0190f0a0-0000-7000-8000-00000000000b';

/** Utilisateurs de test : un par rôle dans l'organisation A, et un manager de l'organisation B. */
export const testActors = {
  adminOfA: {
    userId: '0190f0a0-0000-7000-8000-0000000000a1',
    organizationId: ORGANIZATION_A,
    roles: ['admin'],
  },
  managerOfA: {
    userId: '0190f0a0-0000-7000-8000-0000000000a2',
    organizationId: ORGANIZATION_A,
    roles: ['manager'],
  },
  employeeOfA: {
    userId: '0190f0a0-0000-7000-8000-0000000000a3',
    organizationId: ORGANIZATION_A,
    roles: ['employee'],
  },
  managerOfB: {
    userId: '0190f0a0-0000-7000-8000-0000000000b2',
    organizationId: ORGANIZATION_B,
    roles: ['manager'],
  },
} satisfies Record<string, Actor>;

/** Instant fixe de l'horloge des tests HTTP. */
export const TEST_NOW = Temporal.Instant.from('2026-11-15T08:00:00Z');

export interface StaffTestApp {
  app: INestApplication;
  /** Les sites et les compétences connus du contexte `organization`, déclarés par le test. */
  catalog: InMemoryOrganizationCatalog;
  /** Les employés et leurs contrats sont créés par use case : l'API ne les écrit pas encore. */
  createEmployee: CreateEmployee;
  createContract: CreateContract;
}

@Module({})
class TestOrganizationCatalogModule {
  static with(catalog: InMemoryOrganizationCatalog): DynamicModule {
    return {
      module: TestOrganizationCatalogModule,
      providers: [{ provide: ORGANIZATION_CATALOG, useValue: catalog }],
      exports: [ORGANIZATION_CATALOG],
    };
  }
}

/**
 * Application de test du contexte, avec un dépôt et un catalogue en mémoire, une horloge fixe et
 * des identifiants prévisibles. L'utilisateur vient de l'en-tête `x-test-actor`.
 */
export async function createStaffTestApp(): Promise<StaffTestApp> {
  const catalog = new InMemoryOrganizationCatalog();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ProblemDetailsModule,
      AuthModule.forRoot({ resolveActor: testActorResolver }),
      ClockModule,
      IdsModule,
      StaffModule.forRoot({ organizationCatalog: TestOrganizationCatalogModule.with(catalog) }),
    ],
  })
    .overrideProvider(CLOCK)
    .useValue(new FixedClock(TEST_NOW))
    .overrideProvider(ID_GENERATOR)
    .useValue(new SequentialIdGenerator())
    .overrideProvider(EMPLOYEE_REPOSITORY)
    .useValue(new InMemoryEmployeeRepository())
    .overrideProvider(CONTRACT_REPOSITORY)
    .useValue(new InMemoryContractRepository())
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return {
    app,
    catalog,
    createEmployee: moduleRef.get(CreateEmployee, { strict: false }),
    createContract: moduleRef.get(CreateContract, { strict: false }),
  };
}

/** Requête `GET` au nom d'un utilisateur, ou anonyme sans utilisateur. */
export function getAs(app: INestApplication, actor: Actor | undefined, path: string): request.Test {
  const test = request(app.getHttpServer()).get(path);
  if (actor === undefined) {
    return test;
  }
  return test.set(TEST_ACTOR_HEADER, testActorHeader(actor));
}
