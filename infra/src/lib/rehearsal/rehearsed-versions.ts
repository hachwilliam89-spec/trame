const COMMIT = /^[0-9a-f]{40}$/;

export interface RehearsedVersions {
  /** La version mise en service, celle que B2b déploiera quand la répétition est à la demande. */
  target: string;
  /** La version en service avant elle, vers laquelle la répétition revient. */
  previous: string;
}

export interface VersionChoice {
  /** Commits de main, du plus récent au plus ancien (`git log --first-parent`). */
  history: string[];
  requestedTarget?: string;
  requestedPrevious?: string;
  /** Vrai si le manifeste de version signé de ce commit est publié. */
  isPublished: (commit: string) => Promise<boolean>;
}

/**
 * Les deux versions publiées de la répétition. Sans demande, la dernière version publiée de main
 * et la précédente ; sinon, celles demandées, qui doivent être publiées et se suivre dans main.
 */
export async function chooseRehearsedVersions(choice: VersionChoice): Promise<RehearsedVersions> {
  const target = await chooseTarget(choice);
  const previous = await choosePrevious(choice, target);
  return { target, previous };
}

async function chooseTarget(choice: VersionChoice): Promise<string> {
  if (choice.requestedTarget === undefined) {
    return firstPublished(choice.history, choice.isPublished, 'dans l’historique de main');
  }
  await requirePublishedMainCommit(choice, choice.requestedTarget);
  return choice.requestedTarget;
}

async function choosePrevious(choice: VersionChoice, target: string): Promise<string> {
  const olderCommits = choice.history.slice(choice.history.indexOf(target) + 1);
  if (choice.requestedPrevious === undefined) {
    return firstPublished(olderCommits, choice.isPublished, `avant ${target}`);
  }
  await requirePublishedMainCommit(choice, choice.requestedPrevious);
  if (!olderCommits.includes(choice.requestedPrevious)) {
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
  if (!choice.history.includes(commit)) {
    throw new Error(`Version ${commit} absente de l’historique de main.`);
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
