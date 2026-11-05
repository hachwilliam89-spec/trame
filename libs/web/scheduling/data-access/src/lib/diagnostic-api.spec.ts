import { DiagnosticApi } from './diagnostic-api';
const runId = '0190f0a0-0000-7000-8000-000000000002';
const queued = { id: runId, status: 'QUEUED', createdAt: '2026-11-05T10:00:00Z' };
describe('Client HTTP du diagnostic', () => {
  it('utilise fetch sans receveur applicatif et limite le Bearer aux en-têtes', async () => {
    const requests: { url: string; options: RequestInit }[] = [];
    const request: typeof fetch = function (this: unknown, input, options) {
      if (this !== undefined) throw new TypeError('Illegal invocation');
      requests.push({ url: String(input), options: options ?? {} });
      return Promise.resolve(Response.json(queued));
    };
    const api = new DiagnosticApi(async () => 'opaque-access-token', '/api/v1', request);
    expect(await api.start('request-A', new AbortController().signal)).toEqual(queued);
    expect(requests[0]?.url).toBe('/api/v1/diagnostics/solver-runs');
    const options = requests[0]?.options;
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer opaque-access-token');
    expect(new Headers(options?.headers).get('idempotency-key')).toBe('request-A');
    expect(options?.redirect).toBe('error');
    expect(options?.credentials).toBe('omit');
  });
});
