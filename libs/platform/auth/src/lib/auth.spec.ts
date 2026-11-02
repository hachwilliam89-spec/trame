import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProblemDetailsModule } from '@trame/platform/problem-details';
import request from 'supertest';
import { TEST_ACTOR_HEADER, testActorHeader, testActorResolver } from '../testing';
import type { Actor } from './actor';
import { AuthModule } from './auth.module';
import { CurrentActor, Public, RequireRoles } from './decorators';

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
}

const manager: Actor = { userId: 'u-1', organizationId: 'org-a', roles: ['manager'] };
const admin: Actor = { userId: 'u-2', organizationId: 'org-a', roles: ['admin'] };

async function createApp(resolveActor?: typeof testActorResolver): Promise<INestApplication> {
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

    it('répond 401 en problem+json sans utilisateur', async () => {
      const response = await request(app.getHttpServer()).get('/demo/me');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
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
