import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ESLint } from 'eslint';

export const REPOSITORY_ROOT = join(__dirname, '../../../..');

const BOUNDARY_RULE = '@nx/enforce-module-boundaries';

let eslint: ESLint | undefined;

/**
 * Le motif de refus de la règle de frontières pour un import placé dans un fichier d'un projet, ou
 * `undefined` si l'import est admis. Le fichier n'a pas besoin d'exister : la règle le rattache à
 * son projet par son chemin, avec la configuration ESLint du dépôt.
 */
export async function boundaryViolation(
  filePath: string,
  importedModule: string,
): Promise<string | undefined> {
  eslint ??= new ESLint({ cwd: REPOSITORY_ROOT });
  const code = `import * as imported from '${importedModule}';\nexport const probe = imported;\n`;
  const [result] = await eslint.lintText(code, { filePath: join(REPOSITORY_ROOT, filePath) });
  const violation = result?.messages.find((message) => message.ruleId === BOUNDARY_RULE);
  return violation?.message;
}

export interface WorkspaceLibrary {
  /** `api` ou `web`. */
  side: string;
  /** Premier dossier sous `libs/<side>/` : un contexte métier ou un dossier technique. */
  area: string;
  /** Dossier du projet, relatif à la racine du dépôt. */
  root: string;
  tags: string[];
}

/** Les libs de l'API et du front, rangées en `libs/<side>/<area>/<projet>`. */
export async function workspaceLibraries(): Promise<WorkspaceLibrary[]> {
  const libraries: WorkspaceLibrary[] = [];
  for (const side of ['api', 'web']) {
    for (const area of await readdir(join(REPOSITORY_ROOT, 'libs', side))) {
      libraries.push(...(await librariesIn(side, area)));
    }
  }
  return libraries;
}

async function librariesIn(side: string, area: string): Promise<WorkspaceLibrary[]> {
  const libraries: WorkspaceLibrary[] = [];
  for (const project of await readdir(join(REPOSITORY_ROOT, 'libs', side, area))) {
    const root = join('libs', side, area, project);
    const tags = await projectTags(root);
    if (tags !== undefined) {
      libraries.push({ side, area, root, tags });
    }
  }
  return libraries;
}

async function projectTags(root: string): Promise<string[] | undefined> {
  try {
    const project = JSON.parse(await readFile(join(REPOSITORY_ROOT, root, 'project.json'), 'utf8'));
    return (project.tags ?? []) as string[];
  } catch {
    return undefined;
  }
}

/** Les contextes métier déclarés par la configuration ESLint, source des contraintes. */
export async function declaredBoundedContexts(): Promise<string[]> {
  const configuration = (await import(join(REPOSITORY_ROOT, 'eslint.config.mjs'))) as {
    BOUNDED_CONTEXTS: string[];
  };
  return configuration.BOUNDED_CONTEXTS;
}
