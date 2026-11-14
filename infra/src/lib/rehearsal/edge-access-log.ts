import type { ObservedRequest } from './request-tally';

/** Une ligne du journal d'accès de Traefik, réduit à ces trois champs (infra/rehearsal/traefik.yml). */
interface AccessLogLine {
  RequestHost?: string;
  DownstreamStatus?: number;
  StartUTC?: string;
}

/**
 * Les requêtes que Traefik a reçues, lues dans son journal d'accès. C'est ce que compte sa limite
 * de débit : le navigateur, lui, sert une partie des pages depuis son cache, sans rien envoyer.
 */
export function parseEdgeAccessLog(output: string): ObservedRequest[] {
  const requests: ObservedRequest[] = [];
  for (const line of output.split('\n')) {
    const request = readAccessLogLine(line);
    if (request !== undefined) {
      requests.push(request);
    }
  }
  return requests;
}

/** Traefik écrit aussi son propre journal sur la même sortie : seules les requêtes sont gardées. */
function readAccessLogLine(line: string): ObservedRequest | undefined {
  if (!line.startsWith('{')) {
    return undefined;
  }
  const entry = JSON.parse(line) as AccessLogLine;
  if (
    entry.RequestHost === undefined ||
    entry.DownstreamStatus === undefined ||
    entry.StartUTC === undefined
  ) {
    return undefined;
  }
  return {
    host: entry.RequestHost,
    status: entry.DownstreamStatus,
    atMilliseconds: Temporal.Instant.from(entry.StartUTC).epochMilliseconds,
  };
}
