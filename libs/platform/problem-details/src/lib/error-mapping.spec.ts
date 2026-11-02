import { Controller, Get, type INestApplication, UseInterceptors } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { ErrorMapping } from './error-mapping';
import { ErrorMappingInterceptor } from './error-mapping.interceptor';
import { ProblemDetailsModule } from './problem-details.module';

class ItemNotFoundError extends Error {}
class ItemNameAlreadyUsedError extends Error {}
class InvalidColorError extends Error {}
class UnmappedError extends Error {}

const mappings: ErrorMapping[] = [
  { error: ItemNotFoundError, status: 404 },
  {
    error: ItemNameAlreadyUsedError,
    status: 409,
    type: 'tag:example.org,2026-01-01:item-name-already-used',
    title: 'Nom déjà utilisé',
  },
  { error: InvalidColorError, pointer: '#/color', code: 'unknown_color' },
];

@Controller('items')
@UseInterceptors(new ErrorMappingInterceptor(mappings))
class ItemsController {
  @Get('missing')
  missing(): never {
    throw new ItemNotFoundError('Article introuvable.');
  }

  @Get('duplicate')
  async duplicate(): Promise<never> {
    // Une erreur levée dans une fonction asynchrone est traduite aussi.
    await Promise.resolve();
    throw new ItemNameAlreadyUsedError('Le nom « Vis » est déjà utilisé.');
  }

  @Get('invalid')
  invalid(): never {
    throw new InvalidColorError('La couleur « fuchsia » est inconnue.');
  }

  @Get('unmapped')
  unmapped(): never {
    throw new UnmappedError('détail interne');
  }
}

describe('ErrorMappingInterceptor', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProblemDetailsModule],
      controllers: [ItemsController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rend une erreur sans type en about:blank, avec son message en detail', async () => {
    const response = await request(app.getHttpServer()).get('/items/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Article introuvable.',
      instance: '/items/missing',
    });
  });

  it('rend un type de problème spécifique, même levé en asynchrone', async () => {
    const response = await request(app.getHttpServer()).get('/items/duplicate');

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      type: 'tag:example.org,2026-01-01:item-name-already-used',
      title: 'Nom déjà utilisé',
      detail: 'Le nom « Vis » est déjà utilisé.',
    });
  });

  it('rend une erreur de champ comme une erreur de validation', async () => {
    const response = await request(app.getHttpServer()).get('/items/invalid');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      type: 'about:blank',
      detail: 'La requête contient des données invalides.',
      errors: [
        {
          pointer: '#/color',
          detail: 'La couleur « fuchsia » est inconnue.',
          code: 'unknown_color',
        },
      ],
    });
  });

  it('laisse une erreur inconnue devenir un 500 générique, sans son message', async () => {
    const response = await request(app.getHttpServer()).get('/items/unmapped');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('détail interne');
  });
});
