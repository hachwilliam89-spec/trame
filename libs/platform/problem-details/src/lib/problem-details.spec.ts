import {
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProblemDetailsException, problem } from './problem-details';
import { ProblemDetailsModule } from './problem-details.module';

@Controller('demo')
class DemoController {
  @Get('problem')
  problem(): never {
    throw new ProblemDetailsException({
      type: 'https://trame.example/problems/competence-utilisee',
      status: 409,
      title: 'Compétence utilisée',
      detail: 'La compétence CACES R489 est exigée par le poste Cariste.',
      skillId: 'caces-r489',
    });
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('Rôle manager requis.');
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException();
  }

  @Get('crash')
  crash(): never {
    throw new Error('mot de passe de la base : secret');
  }
}

describe('problem()', () => {
  it('complète type et title selon la RFC 9457', () => {
    expect(problem({ status: 404 })).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
    });
  });
});

describe('ProblemDetailsFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProblemDetailsModule],
      controllers: [DemoController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rend une ProblemDetailsException telle quelle, avec ses extensions', async () => {
    const response = await request(app.getHttpServer()).get('/demo/problem?x=1');

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'https://trame.example/problems/competence-utilisee',
      title: 'Compétence utilisée',
      status: 409,
      detail: 'La compétence CACES R489 est exigée par le poste Cariste.',
      skillId: 'caces-r489',
      instance: '/demo/problem',
    });
  });

  it('convertit une HttpException en gardant son statut et son message', async () => {
    const response = await request(app.getHttpServer()).get('/demo/forbidden');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      detail: 'Rôle manager requis.',
      instance: '/demo/forbidden',
    });
  });

  it('rend aussi les routes inconnues en problem+json', async () => {
    const response = await request(app.getHttpServer()).get('/inconnue');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({
      type: 'about:blank',
      status: 404,
      instance: '/inconnue',
    });
  });

  it("ne divulgue jamais le message d'une erreur inattendue, ni dans la réponse ni dans les logs", async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');

    const response = await request(app.getHttpServer()).get('/demo/crash');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/demo/crash',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');

    expect(logged).toHaveBeenCalledTimes(1);
    const [entry] = logged.mock.calls[0] ?? [];
    expect(JSON.stringify(entry)).not.toContain('secret');
    expect(entry).toMatchObject({ msg: 'Erreur inattendue', errorType: 'Error' });
    expect((entry as { stack: string[] }).stack[0]).toMatch(/^at /);
    logged.mockRestore();
  });

  it('ne journalise pas les erreurs 4xx', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');

    await request(app.getHttpServer()).get('/demo/forbidden');

    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
