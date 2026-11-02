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

/**
 * Chemins masqués en défense en profondeur, si un objet de requête brut est journalisé
 * ailleurs que par `serializeRequest`.
 */
export const DEFAULT_REDACTIONS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  // Le referer peut porter la query string d'une autre page (jetons, identifiants).
  'req.headers.referer',
  'res.headers["set-cookie"]',
];

/** Retire la query string et le fragment : seuls le chemin et la méthode sont journalisés. */
export function pathOnly(url: string | undefined): string | undefined {
  return url?.split(/[?#]/, 1)[0];
}

/** Champs de la requête déjà sérialisée par pino-http (`pino-std-serializers`). */
interface SerializedRequestLike {
  id?: unknown;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
}

/** Champs de la réponse déjà sérialisée par pino-http. */
interface SerializedResponseLike {
  statusCode?: number;
}

/**
 * En-têtes de requête journalisés : liste fermée. Tout autre en-tête peut transporter un secret
 * (`Authorization`, `Cookie`, `X-Forwarded-Uri` avec sa query string…) et n'est jamais écrit.
 */
export const LOGGED_REQUEST_HEADERS = ['user-agent', 'content-type', 'content-length'] as const;

/**
 * Requête telle qu'écrite dans les logs, champ par champ : identifiant, méthode, chemin sans
 * query string, et les en-têtes de `LOGGED_REQUEST_HEADERS`. Ni paramètres, ni adresse IP
 * (donnée personnelle), ni autre en-tête.
 */
export function serializeRequest(req: SerializedRequestLike): Record<string, unknown> {
  const headers = Object.fromEntries(
    LOGGED_REQUEST_HEADERS.flatMap((name) => {
      const value = req.headers?.[name];
      return typeof value === 'string' ? [[name, value]] : [];
    }),
  );
  return { id: req.id, method: req.method, url: pathOnly(req.url), headers };
}

/** Réponse telle qu'écrite dans les logs : le statut seulement. */
export function serializeResponse(res: SerializedResponseLike): Record<string, unknown> {
  return { statusCode: res.statusCode };
}

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
    serializers: { req: serializeRequest, res: serializeResponse },
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
