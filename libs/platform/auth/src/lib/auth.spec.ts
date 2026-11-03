import { Controller, Get, type INestApplication, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import request from 'supertest';
import { TEST_ACTOR_HEADER, testActorHeader, testActorResolver } from '../testing';
import type { Actor, ActorResolver } from './actor';
import { AuthModule } from './auth.module';
import { CurrentActor, Public, RequireRoles } from './decorators';
import { IdentityProviderUnavailableError } from './identity-provider-unavailable.error';

@Controller('demo')
class DemoController {
  @Get('public')
  @Public()
  open(): { ok: true } {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentActor() actor: Actor): Actor {
    return actor;
  }

  @Get('admin')
  @RequireRoles('admin')
  admin(): { ok: true } {
    return { ok: true };
  }

  @Get('items/:itemId')
  @RequireRoles('admin')
  item(): { ok: true } {
    return { ok: true };
  }
}

// Fournisseur injecté dans la factory de `forRootAsync`, comme la configuration dans l'API.
const RESOLVER_SOURCE = Symbol('RESOLVER_SOURCE');

@Module({
  providers: [{ provide: RESOLVER_SOURCE, useValue: testActorResolver }],
  exports: [RESOLVER_SOURCE],
})
class ResolverSourceModule {}

const manager: Actor = { userId: 'u-1', organizationId: 'org-a', roles: ['manager'] };
const admin: Actor = { userId: 'u-2', organizationId: 'org-a', roles: ['admin'] };

async function createApp(resolveActor?: ActorResolver): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ProblemDetailsModule, AuthModule.forRoot(resolveActor ? { resolveActor } : {})],
    controllers: [DemoController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('AuthModule', () => {
  describe('avec un résolveur', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(testActorResolver);
    });

    afterAll(async () => {
      await app.close();
    });

    it('laisse passer une route publique sans utilisateur', async () => {
      expect((await request(app.getHttpServer()).get('/demo/public')).status).toBe(200);
    });

    it('répond 401 en problem+json sans utilisateur, avec le schéma attendu (RFC 6750)', async () => {
      const response = await request(app.getHttpServer()).get('/demo/me');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    it("expose l'utilisateur au contrôleur", async () => {
      const response = await request(app.getHttpServer())
        .get('/demo/me')
        .set(TEST_ACTOR_HEADER, testActorHeader(manager));

      expect(response.status).toBe(200);
      expect(response.body).toEqual(manager);
    });

    it('répond 403 sans le rôle exigé, 200 avec', async () => {
      const denied = await request(app.getHttpServer())
        .get('/demo/admin')
        .set(TEST_ACTOR_HEADER, testActorHeader(manager));
      const allowed = await request(app.getHttpServer())
        .get('/demo/admin')
        .set(TEST_ACTOR_HEADER, testActorHeader(admin));

      expect(denied.status).toBe(403);
      expect(allowed.status).toBe(200);
    });

    it('journalise un refus 403 avec le modèle de route, sans la query string ni donnée personnelle', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        await request(app.getHttpServer())
          .get('/demo/items/42?email=jeanne@example.org')
          .set(TEST_ACTOR_HEADER, testActorHeader(manager));

        expect(warn).toHaveBeenCalledWith({
          msg: 'Accès refusé',
          userId: 'u-1',
          route: '/demo/items/:itemId',
          requiredRoles: ['admin'],
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain('jeanne');
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('configuration asynchrone', () => {
    it('reconnaît les utilisateurs avec le résolveur fourni par une factory injectée', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ProblemDetailsModule,
          AuthModule.forRootAsync({
            imports: [ResolverSourceModule],
            inject: [RESOLVER_SOURCE],
            useFactory: (resolveActor: ActorResolver) => ({ resolveActor }),
          }),
        ],
        controllers: [DemoController],
      }).compile();
      const app = moduleRef.createNestApplication({ logger: false });
      await app.init();
      try {
        const response = await request(app.getHttpServer())
          .get('/demo/me')
          .set(TEST_ACTOR_HEADER, testActorHeader(manager));

        expect(response.status).toBe(200);
        expect(response.body).toEqual(manager);
      } finally {
        await app.close();
      }
    });
  });

  describe("fournisseur d'identité indisponible", () => {
    it("répond 503 générique, sans accorder l'accès", async () => {
      const unavailable: ActorResolver = () => {
        throw new IdentityProviderUnavailableError();
      };
      const app = await createApp(unavailable);
      try {
        const response = await request(app.getHttpServer()).get('/demo/me');

        expect(response.status).toBe(503);
        expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
        expect(response.body).not.toHaveProperty('userId');
      } finally {
        await app.close();
      }
    });
  });

  describe('sans résolveur (avant le branchement OIDC)', () => {
    it('refuse toute route non publique, même avec un en-tête de test', async () => {
      const app = await createApp();
      try {
        const response = await request(app.getHttpServer())
          .get('/demo/me')
          .set(TEST_ACTOR_HEADER, testActorHeader(admin));

        expect(response.status).toBe(401);
      } finally {
        await app.close();
      }
    });
  });
});
