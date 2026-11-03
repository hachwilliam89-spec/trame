import type { INestApplication } from '@nestjs/common';
import type { Actor } from '@trame/platform/auth';
import { TEST_ACTOR_HEADER, testActorHeader } from '@trame/platform/auth/testing';
import request from 'supertest';

/** Client HTTP de test, authentifié en tant qu'un utilisateur, ou anonyme sans utilisateur. */
export class TestClient {
  constructor(
    private readonly app: INestApplication,
    private readonly actor?: Actor,
  ) {}

  get(path: string): request.Test {
    return this.authenticate(request(this.app.getHttpServer()).get(path));
  }

  post(path: string, body: object): request.Test {
    return this.authenticate(request(this.app.getHttpServer()).post(path).send(body));
  }

  delete(path: string): request.Test {
    return this.authenticate(request(this.app.getHttpServer()).delete(path));
  }

  private authenticate(test: request.Test): request.Test {
    if (this.actor === undefined) {
      return test;
    }
    return test.set(TEST_ACTOR_HEADER, testActorHeader(this.actor));
  }
}
