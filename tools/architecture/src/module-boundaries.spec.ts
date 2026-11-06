import {
  type WorkspaceLibrary,
  boundaryViolation,
  declaredBoundedContexts,
  workspaceLibraries,
} from './lib/module-boundaries';

/**
 * Les règles d'architecture d'AGENTS.md (1 à 4 et 11) sont vérifiées par la lint : ces tests
 * prouvent que chaque import interdit est bien refusé, et que les imports légitimes passent.
 */
const TECHNICAL_AREAS: Record<string, string[]> = {
  api: ['shared'],
  web: ['auth', 'brand', 'ui'],
};
const API_LAYERS = ['domain', 'application', 'infrastructure'];

function probeIn(libraryRoot: string): string {
  return `${libraryRoot}/src/lib/architecture-probe.ts`;
}

function importPathOf(library: WorkspaceLibrary): string {
  return `@trame/${library.side}/${library.area}/${library.root.split('/').at(-1)}`;
}

async function expectRefused(filePath: string, importedModule: string): Promise<void> {
  const violation = await boundaryViolation(filePath, importedModule);
  expect({ filePath, importedModule, refused: violation !== undefined }).toEqual({
    filePath,
    importedModule,
    refused: true,
  });
}

async function expectAllowed(filePath: string, importedModule: string): Promise<void> {
  expect({
    filePath,
    importedModule,
    violation: await boundaryViolation(filePath, importedModule),
  }).toEqual({ filePath, importedModule, violation: undefined });
}

describe('frontières d’architecture vérifiées par la lint (AGENTS.md)', () => {
  let libraries: WorkspaceLibrary[];
  let boundedContexts: string[];

  beforeAll(async () => {
    libraries = await workspaceLibraries();
    boundedContexts = await declaredBoundedContexts();
  });

  function contextLibraries(): WorkspaceLibrary[] {
    return libraries.filter((library) => boundedContexts.includes(library.area));
  }

  describe('contextes métier (règle 4)', () => {
    it('range chaque lib métier dans un contexte déclaré, et l’étiquette de ce contexte', () => {
      for (const library of libraries) {
        const isTechnical = TECHNICAL_AREAS[library.side]?.includes(library.area) ?? false;
        if (isTechnical) {
          expect({ root: library.root, tags: library.tags }).toEqual({
            root: library.root,
            tags: expect.not.arrayContaining([expect.stringMatching(/^context:/)]),
          });
          continue;
        }
        expect({ root: library.root, declared: boundedContexts.includes(library.area) }).toEqual({
          root: library.root,
          declared: true,
        });
        expect(library.tags).toContain(`context:${library.area}`);
      }
      expect(contextLibraries().length).toBeGreaterThan(0);
    });

    it('refuse qu’une lib d’un contexte importe une lib d’un autre contexte, quelle que soit sa couche', async () => {
      let crossContextImports = 0;
      for (const source of contextLibraries()) {
        for (const target of contextLibraries()) {
          if (source.area === target.area || source.side !== target.side) {
            continue;
          }
          crossContextImports++;
          await expectRefused(probeIn(source.root), importPathOf(target));
        }
      }
      expect(crossContextImports).toBeGreaterThan(0);
    });

    it('laisse l’application assembler les contextes entre eux', async () => {
      for (const target of contextLibraries().filter((library) => library.side === 'api')) {
        await expectAllowed('apps/api/src/app/architecture-probe.ts', importPathOf(target));
      }
    });

    it('laisse un contexte utiliser ses propres couches, le socle, les contrats et la base partagée', async () => {
      const scheduling = 'libs/api/scheduling/infrastructure';
      for (const allowed of [
        '@trame/api/scheduling/application',
        '@trame/api/scheduling/domain',
        '@trame/platform/clock',
        '@trame/shared/contracts',
        '@trame/api/database',
      ]) {
        await expectAllowed(probeIn(scheduling), allowed);
      }
    });
  });

  describe('couches hexagonales (règles 1 à 3)', () => {
    it('refuse au domaine NestJS, Prisma, HTTP et AMQP, et toute autre couche', async () => {
      for (const forbidden of [
        '@nestjs/common',
        '@prisma/client',
        'express',
        'amqplib',
        '@trame/api/scheduling/application',
        '@trame/api/scheduling/infrastructure',
      ]) {
        await expectRefused(probeIn('libs/api/scheduling/domain'), forbidden);
      }
    });

    it('refuse à l’application Prisma, AMQP et l’infrastructure', async () => {
      for (const forbidden of [
        '@prisma/client',
        'amqplib',
        '@trame/api/scheduling/infrastructure',
      ]) {
        await expectRefused(probeIn('libs/api/scheduling/application'), forbidden);
      }
    });

    it('applique les mêmes couches à chaque contexte de l’API', async () => {
      const apiContexts = new Set(
        contextLibraries()
          .filter((library) => library.side === 'api')
          .map((library) => library.area),
      );
      for (const context of apiContexts) {
        for (const layer of API_LAYERS) {
          const tags = libraries.find(
            (library) => library.root === `libs/api/${context}/${layer}`,
          )?.tags;
          expect({ context, layer, tags }).toEqual({
            context,
            layer,
            tags: expect.arrayContaining([`layer:${layer}`, `context:${context}`]),
          });
        }
      }
    });
  });

  describe('socle générique (règle 11)', () => {
    it('refuse au socle toute lib métier', async () => {
      for (const target of contextLibraries().filter((library) => library.side === 'api')) {
        await expectRefused(probeIn('libs/platform/clock'), importPathOf(target));
      }
    });
  });
});
