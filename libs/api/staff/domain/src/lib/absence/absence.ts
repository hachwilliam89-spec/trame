import {
  AbsenceEndNotOnWholeMinuteError,
  AbsenceStartNotOnWholeMinuteError,
  InvalidAbsencePeriodError,
  InvalidAbsenceReasonError,
} from './absence.errors';

const NANOSECONDS_PER_MINUTE = 60_000_000_000n;

/**
 * Motif d'une absence, par catégorie : congé, arrêt de travail, formation, autre (US-033). Aucun
 * texte libre ne l'accompagne : une absence ne porte jamais de détail médical.
 */
export const ABSENCE_REASONS = ['LEAVE', 'SICK_LEAVE', 'TRAINING', 'OTHER'] as const;

export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

/** Ce qu'une modification peut changer : la période et le motif. */
export interface AbsencePeriod {
  startsAt: Temporal.Instant;
  /** Fin de l'absence, exclue. */
  endsAt: Temporal.Instant;
  reason: AbsenceReason;
}

export interface AbsenceProperties extends AbsencePeriod {
  id: string;
  organizationId: string;
  employeeId: string;
  createdAt: Temporal.Instant;
}

/**
 * Absence d'un employé, déclarée par le manager (US-033). La période est faite d'instants, lus
 * dans le fuseau du site (ADR-0019) : une journée entière va de minuit à minuit le lendemain.
 * Ses instants tombent sur une minute entière, la précision des créneaux et des minutes d'absence :
 * le stockage, à la milliseconde, les garde donc à l'identique.
 * Le domaine la conserve sans l'appliquer : écarter l'employé des créneaux qu'elle couvre est une
 * contrainte de planning, donc l'affaire du moteur seul (AGENTS.md, règle 5).
 */
export class Absence {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly startsAt: Temporal.Instant;
  /** Fin de l'absence, exclue. */
  readonly endsAt: Temporal.Instant;
  readonly reason: AbsenceReason;
  readonly createdAt: Temporal.Instant;

  private constructor(properties: AbsenceProperties) {
    this.id = properties.id;
    this.organizationId = properties.organizationId;
    this.employeeId = properties.employeeId;
    this.startsAt = properties.startsAt;
    this.endsAt = properties.endsAt;
    this.reason = properties.reason;
    this.createdAt = properties.createdAt;
  }

  static create(properties: AbsenceProperties): Absence {
    if (!isOnWholeMinute(properties.startsAt)) {
      throw new AbsenceStartNotOnWholeMinuteError();
    }
    if (!isOnWholeMinute(properties.endsAt)) {
      throw new AbsenceEndNotOnWholeMinuteError();
    }
    if (Temporal.Instant.compare(properties.endsAt, properties.startsAt) <= 0) {
      throw new InvalidAbsencePeriodError();
    }
    if (!isAbsenceReason(properties.reason)) {
      throw new InvalidAbsenceReasonError();
    }
    return new Absence(properties);
  }

  /** La même absence, sur une autre période ou pour un autre motif. */
  changeTo(period: AbsencePeriod): Absence {
    return Absence.create({
      id: this.id,
      organizationId: this.organizationId,
      employeeId: this.employeeId,
      createdAt: this.createdAt,
      ...period,
    });
  }

  /** Vrai si l'absence couvre au moins un instant de la période `[from, to[`. */
  overlaps(from: Temporal.Instant, to: Temporal.Instant): boolean {
    const startsBeforeTheEnd = Temporal.Instant.compare(this.startsAt, to) < 0;
    const endsAfterTheStart = Temporal.Instant.compare(this.endsAt, from) > 0;
    return startsBeforeTheEnd && endsAfterTheStart;
  }
}

function isOnWholeMinute(instant: Temporal.Instant): boolean {
  return instant.epochNanoseconds % NANOSECONDS_PER_MINUTE === 0n;
}

function isAbsenceReason(reason: string): reason is AbsenceReason {
  return (ABSENCE_REASONS as readonly string[]).includes(reason);
}
