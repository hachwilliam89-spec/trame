import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface LoggingOptions {
  level: LogLevel;
  /** Sortie lisible pour le développement local (`pino-pretty`). JSON sinon. */
  pretty: boolean;
  /** Chemins supplémentaires à masquer, en syntaxe pino (`req.body.password`). */
  redact?: string[];
  /** Préfixes de chemins dont les requêtes réussies ne sont pas journalisées (healthchecks). */
  quietPaths?: string[];
}

/** En-têtes et champs jamais écrits en clair dans les logs. */
export const DEFAULT_REDACTIONS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[\w-]{8,128}$/;

/** Reprend un `X-Request-Id` entrant s'il est sûr, sinon en génère un. Le renvoie dans la réponse. */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Options pino-http : JSON structuré, identifiant de requête, données sensibles masquées. */
export function createPinoHttpOptions(options: LoggingOptions): Options {
  const quietPaths = options.quietPaths ?? [];
  return {
    level: options.level,
    genReqId: requestIdFor,
    redact: { paths: [...DEFAULT_REDACTIONS, ...(options.redact ?? [])], censor: '[masqué]' },
    autoLogging: {
      ignore: (req) => quietPaths.some((path) => req.url?.startsWith(path) ?? false),
    },
    customLogLevel: (_req, res, error) => {
      if (error !== undefined || res.statusCode >= 500) {
        return 'error';
      }
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
    ...(options.pretty
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  };
}
