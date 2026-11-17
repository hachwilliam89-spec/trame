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
  coverageByDay: DayCoverage[];
  rules: CheckedRuleView[];
  /** Salariés du site écartés du calcul : aucun contrat ne couvre la semaine. */
  excluded: string[];
}

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
    coverage: coverageSummary(rows),
    coverageByDay: coverageByDay(rows, facts),
    rules: checkedRules(generation.outcome?.checkedRules ?? [], generation.problem),
    excluded: generation.excludedEmployees.map((excluded) => facts.nameOf(excluded.employeeId)),
  };
}
