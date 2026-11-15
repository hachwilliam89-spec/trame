import type { CoverageNeed, WeeklyCoverage } from '@trame/api/demand/domain';
import type { CoverageNeedV1, WeeklyCoverageV1 } from '@trame/shared/contracts';

/** Conversion des objets du domaine vers les contrats de l'API (`@trame/shared/contracts`). */

export function toWeeklyCoverageV1(coverage: WeeklyCoverage): WeeklyCoverageV1 {
  return {
    siteId: coverage.siteId,
    weekStartsOn: coverage.weekStartsOn.toString(),
    needs: coverage.needs.map(toCoverageNeedV1),
    updatedAt: coverage.updatedAt.toString(),
  };
}

/** Semaine pour laquelle aucun besoin n'a jamais été défini : une grille vide, sans date. */
export function undefinedWeeklyCoverageV1(
  siteId: string,
  weekStartsOn: Temporal.PlainDate,
): WeeklyCoverageV1 {
  return { siteId, weekStartsOn: weekStartsOn.toString(), needs: [], updatedAt: null };
}

function toCoverageNeedV1(need: CoverageNeed): CoverageNeedV1 {
  return {
    date: need.date.toString(),
    shiftTemplateId: need.shiftTemplateId,
    positionId: need.positionId,
    requiredCount: need.requiredCount,
  };
}
