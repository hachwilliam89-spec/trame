import { z } from 'zod';

/**
 * Problème de planification d'une semaine, tel que l'API l'envoie au moteur (jalon 1, issue #69).
 *
 * C'est un instantané complet : le moteur ne lit jamais la base (règle 6). Il ne contient que des
 * identifiants, jamais de nom de salarié. L'API calcule les instants des shifts dans le fuseau du
 * site (ADR-0019) ; le moteur n'interprète que les règles listées ici, avec leurs paramètres.
 */

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = 10080;

/** Identifiants des règles du jalon 1 : termes métier affichés, donc en français. */
export const schedulingRuleIdV1 = z.enum([
  'HABILITATION_REQUISE',
  'UN_SEUL_SHIFT',
  'REPOS_QUOTIDIEN_MIN',
  'DUREE_QUOTIDIENNE_MAX',
  'DUREE_HEBDOMADAIRE_MAX',
  'VOLUME_CONTRACTUEL',
]);

/** Le salarié détient chaque compétence exigée, valide le jour du shift (expiration incluse). */
export const requiredQualificationRuleV1 = z.object({ id: z.literal('HABILITATION_REQUISE') });

/** Un salarié ne tient jamais deux shifts qui se chevauchent. */
export const singleShiftRuleV1 = z.object({ id: z.literal('UN_SEUL_SHIFT') });

/** Repos entre la fin d'un shift et le début du suivant (C. trav. art. L3131-1). */
export const minimumDailyRestRuleV1 = z.object({
  id: z.literal('REPOS_QUOTIDIEN_MIN'),
  minimumMinutes: z.int().min(1).max(MINUTES_PER_DAY),
});

/** Temps effectif par jour civil local (C. trav. art. L3121-18). */
export const maximumDailyDurationRuleV1 = z.object({
  id: z.literal('DUREE_QUOTIDIENNE_MAX'),
  maximumMinutes: z.int().min(1).max(MINUTES_PER_DAY),
});

/** Temps effectif sur la semaine (C. trav. art. L3121-20). */
export const maximumWeeklyDurationRuleV1 = z.object({
  id: z.literal('DUREE_HEBDOMADAIRE_MAX'),
  maximumMinutes: z.int().min(1).max(MINUTES_PER_WEEK),
});

/** Temps effectif de la semaine entre le minimum et le maximum du contrat de chaque salarié. */
export const contractualVolumeRuleV1 = z.object({ id: z.literal('VOLUME_CONTRACTUEL') });

export const schedulingRuleV1 = z.discriminatedUnion('id', [
  requiredQualificationRuleV1,
  singleShiftRuleV1,
  minimumDailyRestRuleV1,
  maximumDailyDurationRuleV1,
  maximumWeeklyDurationRuleV1,
  contractualVolumeRuleV1,
]);

/** Un besoin à couvrir : un créneau, un poste, un jour. */
const shiftV1 = z.object({
  /** Identifiant opaque, unique dans le problème : les affectations y renvoient. */
  id: z.string().min(1).max(100),
  /** Jour civil local du début du shift, qui porte la durée quotidienne. */
  date: z.iso.date(),
  shiftTemplateId: z.uuid(),
  positionId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  /** Amplitude moins la pause : le temps effectif compté par les règles de durée. */
  effectiveMinutes: z.int().min(1).max(MINUTES_PER_DAY),
  requiredSkillIds: z.array(z.uuid()).max(20),
  requiredCount: z.int().min(1).max(999),
});

const qualificationV1 = z.object({
  skillId: z.uuid(),
  /** Dernier jour de validité, inclus. `null` : sans expiration. */
  expiresOn: z.iso.date().nullable(),
});

const employeeV1 = z.object({
  id: z.uuid(),
  qualifications: z.array(qualificationV1).max(50),
  /** Le contrat qui couvre toute la semaine (décision du 16 novembre 2026). */
  contract: z.object({
    weeklyMinutesMin: z.int().min(0).max(MINUTES_PER_WEEK),
    weeklyMinutesMax: z.int().min(1).max(MINUTES_PER_WEEK),
  }),
});

export const schedulingProblemV1 = z.object({
  /** Lundi de la semaine planifiée. */
  weekStartsOn: z.iso.date(),
  /** Fuseau IANA du site (`Europe/Paris`). */
  timeZone: z.string().min(1).max(64),
  shifts: z.array(shiftV1).max(2000),
  employees: z.array(employeeV1).max(1000),
  rules: z.array(schedulingRuleV1).min(1).max(20),
  /** Mode standard du cadrage §8 : la couverture est un objectif, un manque est permis et chiffré. */
  objective: z.object({ mode: z.literal('STANDARD') }),
});
