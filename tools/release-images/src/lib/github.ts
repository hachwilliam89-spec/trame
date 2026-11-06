import { z } from 'zod';
import { type CommandRunner, runOrFail } from './command-runner';
import { GITHUB_REPOSITORY } from './policy';

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export interface CodeScanningAnalysis {
  category: string;
  commitSha: string;
  error: string;
}

export interface CodeScanningAlert {
  number: number;
  ruleId: string;
  securitySeverity: string | null;
}

/** Ce que le contrôle d'admissibilité lit dans GitHub. */
export interface GitHubReader {
  mainHeadSha(): Promise<string>;
  checkRuns(commit: string): Promise<CheckRun[]>;
  codeScanningAnalyses(commit: string): Promise<CodeScanningAnalysis[]>;
  openCodeScanningAlerts(): Promise<CodeScanningAlert[]>;
}

const checkRunSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
});

const analysisSchema = z.object({
  category: z.string(),
  commit_sha: z.string(),
  error: z.string(),
});

const alertSchema = z.object({
  number: z.number(),
  rule_id: z.string(),
  security_severity: z.string().nullable(),
});

const REPOSITORY_PATH = `repos/${GITHUB_REPOSITORY}`;

/** Lit GitHub par `gh api`. Une erreur de lecture fait échouer le contrôle, jamais l'inverse. */
export function createGitHubReader(run: CommandRunner): GitHubReader {
  async function readLines<Item>(
    path: string,
    jq: string,
    schema: z.ZodType<Item>,
  ): Promise<Item[]> {
    const output = await runOrFail(run, 'gh', ['api', '--paginate', path, '--jq', jq]);
    return parseLines(output, schema);
  }

  return {
    async mainHeadSha() {
      const output = await runOrFail(run, 'gh', [
        'api',
        `${REPOSITORY_PATH}/commits/main`,
        '--jq',
        '.sha',
      ]);
      return output.trim();
    },

    async checkRuns(commit) {
      const path = `${REPOSITORY_PATH}/commits/${commit}/check-runs?per_page=100`;
      const jq = '.check_runs[] | {id, name, status, conclusion}';
      return readLines(path, jq, checkRunSchema);
    },

    async codeScanningAnalyses(commit) {
      // Les analyses les plus récentes viennent en premier : celles de la tête de main y sont.
      const path = `${REPOSITORY_PATH}/code-scanning/analyses?ref=refs/heads/main&per_page=100`;
      const output = await runOrFail(run, 'gh', [
        'api',
        path,
        '--jq',
        '.[] | {category, commit_sha, error}',
      ]);
      const analyses = parseLines(output, analysisSchema);
      return analyses
        .filter((analysis) => analysis.commit_sha === commit)
        .map((analysis) => ({
          category: analysis.category,
          commitSha: analysis.commit_sha,
          error: analysis.error,
        }));
    },

    async openCodeScanningAlerts() {
      const path = `${REPOSITORY_PATH}/code-scanning/alerts?ref=refs/heads/main&state=open&per_page=100`;
      const jq =
        '.[] | {number, rule_id: .rule.id, security_severity: .rule.security_severity_level}';
      const alerts = await readLines(path, jq, alertSchema);
      return alerts.map((alert) => ({
        number: alert.number,
        ruleId: alert.rule_id,
        securitySeverity: alert.security_severity,
      }));
    },
  };
}

/** `gh api --jq` écrit un objet JSON par ligne. */
function parseLines<Item>(output: string, schema: z.ZodType<Item>): Item[] {
  const items: Item[] = [];
  for (const line of output.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const parsed = schema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw new Error(`Réponse inattendue de gh api : ${line}`);
    }
    items.push(parsed.data);
  }
  return items;
}
