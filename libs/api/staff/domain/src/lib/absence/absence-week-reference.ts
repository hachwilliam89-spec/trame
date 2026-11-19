import type { Absence } from './absence';
import { type InstantInterval, unionOf } from './instant-interval';

/**
 * Minutes d'absence d'un salarié sur une semaine, ou les jours dont la durée reste à donner.
 * Le minimum contractuel restant en découle : max(0, minimum − absenceMinutes) (US-033).
 */
export type AbsenceValuation =
  | { readonly status: 'VALUED'; readonly absenceMinutes: number }
  | { readonly status: 'TO_DEFINE'; readonly daysToDefine: readonly Temporal.PlainDate[] };

export type ValuationMethod = 'REFERENCE_PLANNING' | 'EQUAL_SHARE_OF_ACTIVITY_DAYS';

/**
 * Référence figée qui valorise les absences d'un salarié sur une semaine (US-033). Elle est figée
 * à sa première absence de la semaine et ne change plus : aucune génération ultérieure ne peut
 * déplacer les heures qui servent au calcul. Deux stratégies : le planning de référence, ou, sans
 * planning, la convention de démonstration des parts égales.
 */
export interface AbsenceWeekReference {
  readonly method: ValuationMethod;
  readonly organizationId: string;
  readonly employeeId: string;
  /** Lundi de la semaine. */
  readonly weekStartsOn: Temporal.PlainDate;
  readonly frozenAt: Temporal.Instant;
  /** Valorise les absences actives du salarié qui touchent la semaine. */
  value(absences: readonly Absence[]): AbsenceValuation;
}

/** Ce que toute référence fige : le salarié, sa semaine et l’instant du gel. */
export interface FrozenReferenceProperties {
  organizationId: string;
  employeeId: string;
  weekStartsOn: Temporal.PlainDate;
  frozenAt: Temporal.Instant;
}

/**
 * Valorise les absences d'un salarié sur une semaine. Sans référence figée, une absence reste
 * « à définir » : elle n'est jamais comptée pour zéro en silence.
 */
export function valueAbsencesOfWeek(
  reference: AbsenceWeekReference | undefined,
  absences: readonly Absence[],
): AbsenceValuation {
  if (reference !== undefined) {
    return reference.value(absences);
  }
  if (absences.length === 0) {
    return { status: 'VALUED', absenceMinutes: 0 };
  }
  return { status: 'TO_DEFINE', daysToDefine: [] };
}

/** Périodes d'absence du salarié, réunies : une minute couverte deux fois n'y compte qu'une fois. */
export function absentPeriodsOf(absences: readonly Absence[]): InstantInterval[] {
  return unionOf(absences.map((absence) => ({ start: absence.startsAt, end: absence.endsAt })));
}
