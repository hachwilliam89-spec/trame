import type {
  CheckRun,
  CodeScanningAlert,
  CodeScanningAnalysis,
  GitHubReader,
} from '../lib/github';
import { CODE_SCANNING_CATEGORIES, REQUIRED_CHECKS } from '../lib/policy';

/**
 * GitHub en mémoire, réglé par défaut sur une tête de main admissible : chaque test ne change
 * que ce qui le concerne. `mainHeads` donne la tête de main lecture après lecture.
 */
export class InMemoryGitHub implements GitHubReader {
  mainHeads: string[];
  runs: CheckRun[];
  analyses: CodeScanningAnalysis[];
  alerts: CodeScanningAlert[] = [];

  constructor(readonly commit: string) {
    this.mainHeads = [commit];
    this.runs = REQUIRED_CHECKS.map((name, index) => ({
      id: index + 1,
      name,
      status: 'completed',
      conclusion: 'success',
    }));
    this.analyses = CODE_SCANNING_CATEGORIES.map((category) => ({
      category,
      commitSha: commit,
      error: '',
    }));
  }

  async mainHeadSha(): Promise<string> {
    if (this.mainHeads.length > 1) {
      return this.mainHeads.shift() as string;
    }
    return this.mainHeads[0] as string;
  }

  async checkRuns(): Promise<CheckRun[]> {
    return this.runs;
  }

  async codeScanningAnalyses(commit: string): Promise<CodeScanningAnalysis[]> {
    return this.analyses.filter((analysis) => analysis.commitSha === commit);
  }

  async openCodeScanningAlerts(): Promise<CodeScanningAlert[]> {
    return this.alerts;
  }
}
