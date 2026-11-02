import type { ShiftDurations, ShiftTemplate, Site } from '@trame/api/organization/domain';
import type { ShiftDurationsV1, ShiftTemplateV1, SiteV1 } from '@trame/shared/contracts';

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

/** `22:00`, sans les secondes. */
function toLocalTimeText(time: Temporal.PlainTime): string {
  return time.toString({ smallestUnit: 'minute' });
}
