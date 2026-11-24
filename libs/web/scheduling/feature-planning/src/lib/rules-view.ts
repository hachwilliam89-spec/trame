import type { SchedulingProblemV1, SchedulingRuleV1 } from '@trame/shared/contracts/scheduling';
import { durationLabel } from './calendar';

export interface CheckedRuleView {
  label: string;
  /** Référence légale ou contractuelle ; absente pour une règle d'organisation du travail. */
  reference: string | undefined;
}

type RuleId = SchedulingRuleV1['id'];

/**
 * Les règles que le moteur a effectivement vérifiées, avec les valeurs du calcul. Les références
 * viennent de `docs/cadrage.md` §6 (jalon 1, issue #69).
 */
export function checkedRules(
  checkedRuleIds: readonly RuleId[],
  problem: SchedulingProblemV1,
): CheckedRuleView[] {
  const views: CheckedRuleView[] = [];
  for (const rule of problem.rules) {
    if (checkedRuleIds.includes(rule.id)) views.push(ruleView(rule));
  }
  return views;
}

function ruleView(rule: SchedulingRuleV1): CheckedRuleView {
  switch (rule.id) {
    case 'HABILITATION_REQUISE':
      return {
        label: 'Habilitations exigées par le poste, valides le jour du créneau',
        reference: undefined,
      };
    case 'UN_SEUL_SHIFT':
      return {
        label: 'Jamais deux créneaux qui se chevauchent pour une même personne',
        reference: undefined,
      };
    case 'REPOS_QUOTIDIEN_MIN':
      return {
        label: `Repos quotidien d’au moins ${durationLabel(rule.minimumMinutes)} consécutives`,
        reference: 'C. trav., art. L3131-1',
      };
    case 'DUREE_QUOTIDIENNE_MAX':
      return {
        label: `Au plus ${durationLabel(rule.maximumMinutes)} de travail effectif par jour`,
        reference: 'C. trav., art. L3121-18',
      };
    case 'DUREE_HEBDOMADAIRE_MAX':
      return {
        label: `Au plus ${durationLabel(rule.maximumMinutes)} de travail effectif par semaine`,
        reference: 'C. trav., art. L3121-20',
      };
    case 'VOLUME_CONTRACTUEL':
      return {
        // Le moteur retranche les minutes d'absence valorisées du minimum (US-033).
        label: 'Heures planifiées entre le minimum restant après absences et le maximum du contrat',
        reference: 'Contrat de travail',
      };
    case 'INDISPONIBILITE':
      return {
        label: 'Aucune affectation pendant une absence déclarée',
        reference: undefined,
      };
  }
}
