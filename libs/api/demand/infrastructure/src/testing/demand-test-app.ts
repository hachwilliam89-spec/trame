import { type DynamicModule, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DefineWeeklyCoverage } from '@trame/api/demand/application';
import {
  InMemorySiteCatalog,
  InMemoryWeeklyCoverageRepository,
} from '@trame/api/demand/application/testing';
import { type Actor, AuthModule } from '@trame/platform/auth';
import {
  TEST_ACTOR_HEADER,
  testActorHeader,
  testActorResolver,
} from '@trame/platform/auth/testing';
import { CLOCK, ClockModule, FixedClock } from '@trame/platform/clock';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import request from 'supertest';
import { DemandModule } from '../lib/demand.module';
import { SITE_CATALOG, WEEKLY_COVERAGE_REPOSITORY } from '../lib/injection-tokens';

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

export interface DemandTestApp {
  app: INestApplication;
  /** Les sites, créneaux et postes connus du contexte `organization`, déclarés par le test. */
  catalog: InMemorySiteCatalog;
  /** Les besoins sont définis par use case : l'API ne les écrit pas encore. */
  defineWeeklyCoverage: DefineWeeklyCoverage;
}

@Module({})
class TestSiteCatalogModule {
  static with(catalog: InMemorySiteCatalog): DynamicModule {
    return {
      module: TestSiteCatalogModule,
      providers: [{ provide: SITE_CATALOG, useValue: catalog }],
      exports: [SITE_CATALOG],
    };
  }
}

/**
 * Application de test du contexte, avec un dépôt et un catalogue en mémoire et une horloge
 * fixe. L'utilisateur vient de l'en-tête `x-test-actor`.
 */
export async function createDemandTestApp(): Promise<DemandTestApp> {
  const catalog = new InMemorySiteCatalog();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ProblemDetailsModule,
      AuthModule.forRoot({ resolveActor: testActorResolver }),
      ClockModule,
      DemandModule.forRoot({ siteCatalog: TestSiteCatalogModule.with(catalog) }),
    ],
  })
    .overrideProvider(CLOCK)
    .useValue(new FixedClock(TEST_NOW))
    .overrideProvider(WEEKLY_COVERAGE_REPOSITORY)
    .useValue(new InMemoryWeeklyCoverageRepository())
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return {
    app,
    catalog,
    defineWeeklyCoverage: moduleRef.get(DefineWeeklyCoverage, { strict: false }),
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
