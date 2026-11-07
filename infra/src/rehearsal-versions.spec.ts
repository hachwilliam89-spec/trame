import { type MainHistory, chooseRehearsedVersions } from './lib/rehearsal/rehearsed-versions';

/**
 * Les deux versions publiées que joue la répétition du staging (US-005 B2a, étape 4) : la version
 * visée et celle qui la précède dans main.
 */
const NEWEST = 'a'.repeat(40);
const UNPUBLISHED = 'b'.repeat(40);
const OLDER = 'c'.repeat(40);
const OLDEST = 'd'.repeat(40);
const MAIN = [NEWEST, UNPUBLISHED, OLDER, OLDEST];

/** main en mémoire, du plus récent au plus ancien ; seuls `recentCommits` sont parcourus. */
function mainHistory(commits: string[], recentCommits = commits.length): MainHistory {
  return {
    recent: () => Promise.resolve(commits.slice(0, recentCommits)),
    before: (commit) => Promise.resolve(commits.slice(commits.indexOf(commit) + 1)),
    contains: (commit) => Promise.resolve(commits.includes(commit)),
    precedes: (older, newer) =>
      Promise.resolve(commits.includes(older) && commits.indexOf(older) > commits.indexOf(newer)),
  };
}

function publishedAmong(...commits: string[]) {
  return (commit: string): Promise<boolean> => Promise.resolve(commits.includes(commit));
}

describe('versions de la répétition du staging', () => {
  it('prend par défaut les deux dernières versions publiées de main, en sautant les autres', async () => {
    const versions = await chooseRehearsedVersions({
      main: mainHistory(MAIN),
      isPublished: publishedAmong(NEWEST, OLDER, OLDEST),
    });

    expect(versions).toEqual({ target: NEWEST, previous: OLDER });
  });

  it('répète la version demandée, avec la version publiée qui la précède', async () => {
    const versions = await chooseRehearsedVersions({
      main: mainHistory(MAIN),
      requestedTarget: OLDER,
      isPublished: publishedAmong(NEWEST, OLDER, OLDEST),
    });

    expect(versions).toEqual({ target: OLDER, previous: OLDEST });
  });

  it('répète exactement les deux versions demandées', async () => {
    const versions = await chooseRehearsedVersions({
      main: mainHistory(MAIN),
      requestedTarget: NEWEST,
      requestedPrevious: OLDEST,
      isPublished: publishedAmong(NEWEST, OLDER, OLDEST),
    });

    expect(versions).toEqual({ target: NEWEST, previous: OLDEST });
  });

  it('accepte des versions demandées plus anciennes que l’historique parcouru par défaut', async () => {
    const recentCommits: string[] = [];
    for (let index = 0; index < 61; index += 1) {
      recentCommits.push(index.toString(16).padStart(40, '0'));
    }
    const target = recentCommits[0] ?? '';
    const longMain = [...recentCommits, OLDEST];

    const versions = await chooseRehearsedVersions({
      main: mainHistory(longMain, 60),
      requestedTarget: target,
      requestedPrevious: OLDEST,
      isPublished: publishedAmong(target, OLDEST),
    });

    expect(versions).toEqual({ target, previous: OLDEST });
  });

  it('refuse une version demandée qui n’est pas publiée', async () => {
    await expect(
      chooseRehearsedVersions({
        main: mainHistory(MAIN),
        requestedTarget: UNPUBLISHED,
        isPublished: publishedAmong(NEWEST, OLDER),
      }),
    ).rejects.toThrow(`Version ${UNPUBLISHED} non publiée.`);
  });

  it('refuse une version demandée absente de main', async () => {
    const elsewhere = 'e'.repeat(40);

    await expect(
      chooseRehearsedVersions({
        main: mainHistory(MAIN),
        requestedTarget: elsewhere,
        isPublished: publishedAmong(elsewhere, OLDER),
      }),
    ).rejects.toThrow(`Version ${elsewhere} absente de main.`);
  });

  it('refuse une version précédente postérieure à la version visée, ou égale', async () => {
    for (const previous of [NEWEST, OLDER]) {
      await expect(
        chooseRehearsedVersions({
          main: mainHistory(MAIN),
          requestedTarget: OLDER,
          requestedPrevious: previous,
          isPublished: publishedAmong(NEWEST, OLDER, OLDEST),
        }),
      ).rejects.toThrow(`La version précédente ${previous} doit précéder ${OLDER} dans main.`);
    }
  });

  it('refuse un commit mal formé', async () => {
    await expect(
      chooseRehearsedVersions({
        main: mainHistory(MAIN),
        requestedTarget: 'main',
        isPublished: publishedAmong(NEWEST),
      }),
    ).rejects.toThrow('Commit mal formé : main (40 caractères hexadécimaux attendus).');
  });

  it('échoue faute de deux versions publiées dans l’historique', async () => {
    await expect(
      chooseRehearsedVersions({ main: mainHistory(MAIN), isPublished: publishedAmong(NEWEST) }),
    ).rejects.toThrow('Aucune version publiée avant');
  });
});
