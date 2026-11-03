export interface MergeArguments {
  number: number;
  timeoutMinutes: number;
}

export const USAGE = 'Usage : pnpm pr:merge <numéro de PR> [--timeout <minutes>]';

/** Assez pour la CI et CodeQL, qui tournent en parallèle, même après une mise à jour de branche. */
const DEFAULT_TIMEOUT_MINUTES = 30;

export function parseArguments(args: string[]): MergeArguments {
  const [numberArgument, ...options] = args;
  const number = parsePositiveInteger(numberArgument);

  if (options.length === 0) {
    return { number, timeoutMinutes: DEFAULT_TIMEOUT_MINUTES };
  }
  const [optionName, optionValue, ...rest] = options;
  if (optionName !== '--timeout' || rest.length > 0) {
    throw new Error(USAGE);
  }
  return { number, timeoutMinutes: parsePositiveInteger(optionValue) };
}

function parsePositiveInteger(text: string | undefined): number {
  if (text === undefined || !/^\d+$/.test(text)) {
    throw new Error(USAGE);
  }
  const value = Number(text);
  if (value === 0) {
    throw new Error(USAGE);
  }
  return value;
}
