import { UnknownTimeZoneError } from './site.errors';

/**
 * Fuseau IANA d'un site (`Europe/Paris`). Toutes les heures locales du site s'y interprètent (ADR-0019).
 * Les décalages fixes (`+02:00`) sont refusés : ils ignorent les changements d'heure.
 */
export class TimeZone {
  private constructor(readonly id: string) {}

  /** Accepte un nom IANA quelle que soit sa casse, et le normalise : `europe/paris` donne `Europe/Paris`. */
  static of(name: string): TimeZone {
    const id = normalizedTimeZoneId(name);
    if (id === undefined) {
      throw new UnknownTimeZoneError(name);
    }
    return new TimeZone(id);
  }
}

function normalizedTimeZoneId(name: string): string | undefined {
  if (isFixedOffset(name)) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat('en', { timeZone: name }).resolvedOptions().timeZone;
  } catch (error) {
    // Intl lève une RangeError pour un fuseau qu'il ne connaît pas.
    if (error instanceof RangeError) {
      return undefined;
    }
    throw error;
  }
}

function isFixedOffset(name: string): boolean {
  return name.startsWith('+') || name.startsWith('-');
}
