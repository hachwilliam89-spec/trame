import { ProblemDetailsException } from '@trame/platform/problem-details';
import { z } from 'zod';
import { en, fr } from 'zod/locales';
import { ZodValidationPipe, toJsonPointer } from './zod-validation.pipe';

const createSite = z.object({
  code: z.string().min(2),
  timezone: z.string().default('Europe/Paris'),
  shifts: z.array(z.object({ label: z.string().min(1) })),
});

function problemOf(fn: () => unknown): ProblemDetailsException {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProblemDetailsException) {
      return error;
    }
    throw error;
  }
  throw new Error("Aucune ProblemDetailsException n'a été levée.");
}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createSite);

  beforeAll(() => {
    z.config(fr());
  });

  afterAll(() => {
    z.config(en());
  });

  it('renvoie la valeur parsée, valeurs par défaut comprises', () => {
    expect(pipe.transform({ code: 'COL', shifts: [] })).toEqual({
      code: 'COL',
      timezone: 'Europe/Paris',
      shifts: [],
    });
  });

  it('refuse une entrée invalide avec un problème 400 et un pointeur par champ', () => {
    const { problem } = problemOf(() => pipe.transform({ code: 'C', shifts: [{ label: '' }] }));

    expect(problem).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'La requête contient des données invalides.',
    });
    expect(problem['errors']).toEqual([
      expect.objectContaining({ pointer: '#/code', code: 'too_small' }),
      expect.objectContaining({ pointer: '#/shifts/0/label', code: 'too_small' }),
    ]);
  });

  it('donne des messages en français une fois la locale zod configurée', () => {
    const { problem } = problemOf(() => pipe.transform({ shifts: [] }));
    const [error] = problem['errors'] as { detail: string }[];

    expect(error?.detail).toMatch(/attendu/i);
  });
});

describe('toJsonPointer', () => {
  it('échappe ~ et / selon la RFC 6901', () => {
    expect(toJsonPointer(['a/b', 'c~d', 0])).toBe('#/a~1b/c~0d/0');
  });
});
