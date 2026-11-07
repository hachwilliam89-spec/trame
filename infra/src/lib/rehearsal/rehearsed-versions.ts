const COMMIT = /^[0-9a-f]{40}$/;

export interface RehearsedVersions {
  /** La version mise en service, celle que B2b déploiera quand la répétition est à la demande. */
  target: string;
  /** La version en service avant elle, vers laquelle la répétition revient. */
  previous: string;
}

/** L'historique de main, lu dans le clone du dépôt. */
export interface MainHistory {
  /** Les derniers commits de main, du plus récent au plus ancien : le choix par défaut. */
  recent(): Promise<string[]>;
  /** Les commits de main qui précèdent celui-ci, du plus récent au plus ancien. */
  before(commit: string): Promise<string[]>;
  /** Vrai si ce commit appartient à main, à toute profondeur. */
  contains(commit: string): Promise<boolean>;
  /** Vrai si `older` précède strictement `newer`, à toute profondeur. */
  precedes(older: string, newer: string): Promise<boolean>;
}

export interface VersionChoice {
  main: MainHistory;
  requestedTarget?: string;
  requestedPrevious?: string;
  /** Vrai si le manifeste de version signé de ce commit est publié. */
  isPublished: (commit: string) => Promise<boolean>;
}

/**
 * Les deux versions publiées de la répétition. Sans demande, la dernière version publiée de main
 * et la précédente. Une version demandée est vérifiée dans tout l'historique de main, sans
 * limite : une ancienne version encore en service reste répétable.
 */
export async function chooseRehearsedVersions(choice: VersionChoice): Promise<RehearsedVersions> {
  const target = await chooseTarget(choice);
  const previous = await choosePrevious(choice, target);
  return { target, previous };
}

async function chooseTarget(choice: VersionChoice): Promise<string> {
  if (choice.requestedTarget === undefined) {
    return firstPublished(await choice.main.recent(), choice.isPublished, 'dans main');
  }
  await requirePublishedMainCommit(choice, choice.requestedTarget);
  return choice.requestedTarget;
}

async function choosePrevious(choice: VersionChoice, target: string): Promise<string> {
  if (choice.requestedPrevious === undefined) {
    return firstPublished(await choice.main.before(target), choice.isPublished, `avant ${target}`);
  }
  await requirePublishedMainCommit(choice, choice.requestedPrevious);
  if (!(await choice.main.precedes(choice.requestedPrevious, target))) {
    throw new Error(
      `La version précédente ${choice.requestedPrevious} doit précéder ${target} dans main.`,
    );
  }
  return choice.requestedPrevious;
}

async function requirePublishedMainCommit(choice: VersionChoice, commit: string): Promise<void> {
  if (!COMMIT.test(commit)) {
    throw new Error(`Commit mal formé : ${commit} (40 caractères hexadécimaux attendus).`);
  }
  if (!(await choice.main.contains(commit))) {
    throw new Error(`Version ${commit} absente de main.`);
  }
  if (!(await choice.isPublished(commit))) {
    throw new Error(`Version ${commit} non publiée.`);
  }
}

async function firstPublished(
  commits: string[],
  isPublished: (commit: string) => Promise<boolean>,
  where: string,
): Promise<string> {
  for (const commit of commits) {
    if (await isPublished(commit)) {
      return commit;
    }
  }
  throw new Error(`Aucune version publiée ${where}.`);
}
