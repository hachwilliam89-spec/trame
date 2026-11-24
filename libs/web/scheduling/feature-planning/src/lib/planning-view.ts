import type { ScheduleGenerationV1 } from '@trame/shared/contracts/scheduling';
import type { PlanningCatalog } from '@trame/web/scheduling/data-access';
import { isoWeekNumber, weekRangeLabel, type WeekDay } from './calendar';
import {
  coverageByDay,
  coverageRows,
  coverageSummary,
  type CoverageSummary,
  type DayCoverage,
} from './coverage-view';
import { planningFacts, type ShiftKind } from './planning-facts';
import { checkedRules, type CheckedRuleView } from './rules-view';
import { teamRows, type TeamRow } from './team-view';
import { weekSummary, type WeekSummary } from './week-summary';

/** Jour affiché dans la grille. */
export interface DisplayedDay extends WeekDay {
  /** `Lundi 23 nov.` : le libellé du choix de la vue. */
  optionLabel: string;
}

/** Tout ce que l'écran affiche, prêt à lire : les gabarits ne calculent rien. */
export interface PlanningView {
  siteName: string;
  weekNumber: number;
  rangeLabel: string;
  /** Jours qui ont au moins un besoin : les colonnes de la grille. */
  days: DisplayedDay[];
  /** Jours sans besoin, en minuscules : `dimanche`. */
  daysWithoutNeeds: string[];
  shiftKinds: ShiftKind[];
  team: TeamRow[];
  coverage: CoverageSummary;
  summary: WeekSummary;
  coverageByDay: DayCoverage[];
  rules: CheckedRuleView[];
  /** Salariés du site écartés du calcul, avec la raison. */
  excluded: ExcludedEmployee[];
}

export interface ExcludedEmployee {
  name: string;
  /** En minuscules, pour suivre « Hors du calcul » : `durée d’absence à définir`. */
  reason: string;
}

type ExclusionReason = ScheduleGenerationV1['excludedEmployees'][number]['reason'];

const EXCLUSION_REASONS: Record<ExclusionReason, string> = {
  NO_CONTRACT_COVERING_WEEK: 'aucun contrat ne couvre la semaine',
  // US-033 : une absence de la semaine sans durée connue ; son minimum n'est pas levé en silence.
  ABSENCE_VALUATION_TO_DEFINE: 'durée d’absence à définir',
};

/** Le planning d'une génération exploitable, enrichi des libellés du site. */
export function planningView(
  generation: ScheduleGenerationV1,
  catalog: PlanningCatalog,
): PlanningView {
  const facts = planningFacts(generation, catalog);
  const datesWithNeeds = new Set(facts.shifts.map((planned) => planned.day.date));
  const days = facts.days
    .filter((day) => datesWithNeeds.has(day.date))
    .map((day) => ({ ...day, optionLabel: `${day.name} ${day.dayOfMonth} ${day.shortMonth}` }));
  const rows = coverageRows(facts);
  const coverage = coverageSummary(rows);
  return {
    siteName: catalog.site.name,
    weekNumber: isoWeekNumber(generation.weekStartsOn),
    rangeLabel: weekRangeLabel(generation.weekStartsOn),
    days,
    daysWithoutNeeds: facts.days
      .filter((day) => !datesWithNeeds.has(day.date))
      .map((day) => day.name.toLowerCase()),
    shiftKinds: facts.shiftKinds,
    team: teamRows(generation.problem.employees, facts, days),
    coverage,
    summary: weekSummary(generation, rows, coverage),
    coverageByDay: coverageByDay(rows, facts),
    rules: checkedRules(generation.outcome?.checkedRules ?? [], generation.problem),
    excluded: generation.excludedEmployees.map((excluded) => ({
      name: facts.nameOf(excluded.employeeId),
      reason: EXCLUSION_REASONS[excluded.reason],
    })),
  };
}
