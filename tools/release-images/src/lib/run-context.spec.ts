import { readRunContext } from './run-context';

const COMMIT = 'a'.repeat(40);

const ENVIRONMENT = {
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: COMMIT,
  GITHUB_REPOSITORY: 'hachwilliam89-spec/trame',
};

describe('readRunContext', () => {
  it('lit l’événement, la référence, le commit et le dépôt du run', () => {
    expect(readRunContext(ENVIRONMENT)).toEqual({
      eventName: 'push',
      ref: 'refs/heads/main',
      sha: COMMIT,
      repository: 'hachwilliam89-spec/trame',
    });
  });

  it('exige les variables de GitHub Actions', () => {
    expect(() => readRunContext({ ...ENVIRONMENT, GITHUB_SHA: undefined })).toThrow(
      'Variable GitHub Actions manquante : GITHUB_SHA.',
    );
  });
});
