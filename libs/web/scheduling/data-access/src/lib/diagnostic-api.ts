import {
  diagnosticRunV1,
  type DiagnosticProgressV1,
  type DiagnosticRunV1,
} from '@trame/shared/contracts/scheduling';
import { readProgress } from './progress-stream';

export class DiagnosticHttpError extends Error {
  constructor(readonly status: number) {
    super('Diagnostic indisponible');
  }
}
export interface DiagnosticGateway {
  start(key: string, signal: AbortSignal): Promise<DiagnosticRunV1>;
  get(runId: string, signal: AbortSignal): Promise<DiagnosticRunV1>;
  follow(
    runId: string,
    after: string | undefined,
    receive: (event: DiagnosticProgressV1) => void,
    signal: AbortSignal,
  ): Promise<void>;
}
export class DiagnosticApi implements DiagnosticGateway {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly basePath = '/api/v1',
    private readonly request: typeof fetch = fetch,
  ) {}
  async start(key: string, signal: AbortSignal): Promise<DiagnosticRunV1> {
    const response = await this.call('', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      signal,
    });
    return diagnosticRunV1.parse(await response.json());
  }
  async get(runId: string, signal: AbortSignal): Promise<DiagnosticRunV1> {
    const response = await this.call('/' + encodeURIComponent(runId), { signal });
    const run = diagnosticRunV1.parse(await response.json());
    if (run.id !== runId) throw new Error('Diagnostic incohérent');
    return run;
  }
  async follow(
    runId: string,
    after: string | undefined,
    receive: (event: DiagnosticProgressV1) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = { accept: 'text/event-stream' };
    if (after !== undefined) headers['last-event-id'] = after;
    const response = await this.call('/' + encodeURIComponent(runId) + '/events', {
      headers,
      signal,
    });
    if (response.status === 204) return;
    await readProgress(response, runId, receive);
  }
  private async call(path: string, options: RequestInit): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('authorization', 'Bearer ' + (await this.token()));
    const execute = this.request;
    const response = await execute(this.basePath + '/diagnostics/solver-runs' + path, {
      ...options,
      headers,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new DiagnosticHttpError(response.status);
    return response;
  }
}
