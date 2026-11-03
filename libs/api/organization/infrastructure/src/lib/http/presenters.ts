import type {
  Position,
  ShiftDurations,
  ShiftTemplate,
  Site,
  Skill,
} from '@trame/api/organization/domain';
import type {
  PositionV1,
  ShiftDurationsV1,
  ShiftTemplateV1,
  SiteV1,
  SkillV1,
} from '@trame/shared/contracts';

/** Conversion des objets du domaine vers les contrats de l'API (`@trame/shared/contracts`). */

export function toSiteV1(site: Site): SiteV1 {
  return {
    id: site.id,
    code: site.code.value,
    name: site.name,
    timeZone: site.timeZone.id,
    createdAt: site.createdAt.toString(),
  };
}

export function toShiftTemplateV1(shiftTemplate: ShiftTemplate): ShiftTemplateV1 {
  return {
    id: shiftTemplate.id,
    siteId: shiftTemplate.siteId,
    label: shiftTemplate.label,
    startTime: toLocalTimeText(shiftTemplate.start),
    endTime: toLocalTimeText(shiftTemplate.end),
    break: {
      startTime: toLocalTimeText(shiftTemplate.break.start),
      durationMinutes: shiftTemplate.break.durationMinutes,
    },
    crossesMidnight: shiftTemplate.crossesMidnight,
    createdAt: shiftTemplate.createdAt.toString(),
  };
}

export function toShiftDurationsV1(
  date: Temporal.PlainDate,
  durations: ShiftDurations,
): ShiftDurationsV1 {
  return {
    date: date.toString(),
    startsAt: durations.startsAt.toString(),
    endsAt: durations.endsAt.toString(),
    amplitudeMinutes: durations.amplitudeMinutes,
    breakMinutes: durations.breakMinutes,
    effectiveMinutes: durations.effectiveMinutes,
  };
}

export function toSkillV1(skill: Skill): SkillV1 {
  return {
    id: skill.id,
    name: skill.name,
    createdAt: skill.createdAt.toString(),
  };
}

export function toPositionV1(position: Position): PositionV1 {
  return {
    id: position.id,
    siteId: position.siteId,
    name: position.name,
    skillIds: [...position.skillIds],
    createdAt: position.createdAt.toString(),
  };
}

/** `22:00`, sans les secondes. */
function toLocalTimeText(time: Temporal.PlainTime): string {
  return time.toString({ smallestUnit: 'minute' });
}
