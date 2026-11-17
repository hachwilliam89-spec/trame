/*
 * Dates du planning, sans Temporal : tous les navigateurs pris en charge ne l'ont pas encore.
 * Un jour civil (`2026-11-23`) est calculé comme un minuit UTC et toujours formaté en UTC : il ne
 * dépend donc jamais du fuseau du navigateur. Les instants, eux, sont lus dans le fuseau du site.
 */
const DAY_IN_MILLISECONDS = 86_400_000;
const DAYS_IN_WEEK = 7;
const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const SHORT_MONTHS = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

export interface WeekDay {
  /** Jour civil ISO : `2026-11-23`. */
  date: string;
  name: string;
  /** Forme courte des écrans étroits : `Lun.`. */
  abbreviation: string;
  dayOfMonth: number;
  /** Mois abrégé : `nov.`. */
  shortMonth: string;
}

interface CivilDate {
  year: number;
  /** De 1 à 12. */
  month: number;
  day: number;
}

/** Les sept jours d'une semaine qui commence un lundi. */
export function weekDays(weekStartsOn: string): WeekDay[] {
  const monday = toUtcMidnight(weekStartsOn);
  const days: WeekDay[] = [];
  for (let index = 0; index < DAYS_IN_WEEK; index += 1) {
    const civil = civilDateOf(monday + index * DAY_IN_MILLISECONDS);
    const name = DAY_NAMES[index] ?? '';
    days.push({
      date: isoDateOf(civil),
      name,
      abbreviation: name.slice(0, 3) + '.',
      dayOfMonth: civil.day,
      shortMonth: SHORT_MONTHS.format(Date.UTC(civil.year, civil.month - 1, 1)),
    });
  }
  return days;
}

/** Numéro ISO 8601 : la semaine 1 est celle qui contient le premier jeudi de l'année. */
export function isoWeekNumber(weekStartsOn: string): number {
  const thursday = toUtcMidnight(weekStartsOn) + 3 * DAY_IN_MILLISECONDS;
  const yearOfThursday = civilDateOf(thursday).year;
  const firstJanuary = toUtcMidnight(`${yearOfThursday}-01-01`);
  const daysSinceFirstJanuary = Math.round((thursday - firstJanuary) / DAY_IN_MILLISECONDS);
  return Math.floor(daysSinceFirstJanuary / DAYS_IN_WEEK) + 1;
}

/** `23–29 novembre 2026`, `30 novembre – 6 décembre 2026`, `28 décembre 2026 – 3 janvier 2027`. */
export function weekRangeLabel(weekStartsOn: string): string {
  const monday = civilDateOf(toUtcMidnight(weekStartsOn));
  const sunday = civilDateOf(toUtcMidnight(weekStartsOn) + 6 * DAY_IN_MILLISECONDS);
  const end = `${sunday.day} ${monthName(sunday)} ${sunday.year}`;
  if (monday.year !== sunday.year) {
    return `${monday.day} ${monthName(monday)} ${monday.year} – ${end}`;
  }
  if (monday.month !== sunday.month) {
    return `${monday.day} ${monthName(monday)} – ${end}`;
  }
  return `${monday.day}–${end}`;
}

/** Heure locale du site, à la française : `06 h`, `13 h 20`. */
export function localTimeLabel(instant: string, timeZone: string): string {
  const { hour, minute } = localClock(instant, timeZone);
  return minute === '00' ? `${hour} h` : `${hour} h ${minute}`;
}

/** Minutes écoulées depuis minuit, à l'heure locale du site : de quoi ordonner les créneaux. */
export function localMinutesOfDay(instant: string, timeZone: string): number {
  const { hour, minute } = localClock(instant, timeZone);
  return Number(hour) * 60 + Number(minute);
}

/** Durée en heures et minutes : `35 h`, `34 h 30`. */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

/** Heure et minute d'un instant dans le fuseau du site, sur deux chiffres. */
function localClock(instant: string, timeZone: string): { hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(instant));
  return {
    hour: parts.find((part) => part.type === 'hour')?.value ?? '00',
    minute: parts.find((part) => part.type === 'minute')?.value ?? '00',
  };
}

function toUtcMidnight(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function civilDateOf(utcMidnight: number): CivilDate {
  const date = new Date(utcMidnight);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function isoDateOf(civil: CivilDate): string {
  const month = String(civil.month).padStart(2, '0');
  const day = String(civil.day).padStart(2, '0');
  return `${civil.year}-${month}-${day}`;
}

function monthName(civil: CivilDate): string {
  return MONTHS.format(Date.UTC(civil.year, civil.month - 1, 1));
}
