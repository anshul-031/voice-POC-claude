/**
 * Timezone-aware date helpers.
 *
 * The scheduler has to compare two fundamentally different things:
 *   - `scheduledAt`, an absolute instant (unambiguous, stored as UTC), and
 *   - `windowStart`/`windowEnd`, a *wall clock* time-of-day that only means
 *     something relative to a timezone.
 *
 * Reading a wall clock with `Date#getHours()` silently resolves it in the Node
 * process timezone, which is the developer's machine locally and almost always
 * UTC in a container. That mismatch delayed campaigns by the user's UTC offset,
 * so every wall-clock comparison in this codebase must go through here with an
 * explicit IANA zone instead.
 */
import { CAMPAIGN_SCHEDULER } from '../types/index.js';
import type { ZonedDateTimeParts } from '../types/index.js';

const MS_PER_MINUTE = 60_000;

/** Cache of validated zone names — `Intl` construction is comparatively slow. */
const validatedZones = new Map<string, boolean>();

/** Cache of formatters, keyed by zone. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Whether the runtime's ICU data recognises `timeZone` as an IANA zone. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;

  const cached = validatedZones.get(timeZone);
  if (cached !== undefined) return cached;

  // Reject obviously malformed input before handing it to Intl, which accepts
  // some surprising values (e.g. lone offsets) depending on the runtime.
  if (!CAMPAIGN_SCHEDULER.TIMEZONE_PATTERN.test(timeZone)
    || timeZone.length > CAMPAIGN_SCHEDULER.MAX_TIMEZONE_LENGTH) {
    validatedZones.set(timeZone, false);
    return false;
  }

  let valid = true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    valid = false;
  }
  validatedZones.set(timeZone, valid);
  return valid;
}

/**
 * Normalises a stored/incoming zone into one that is safe to use, falling back
 * to UTC rather than the ambient process timezone.
 */
export function resolveTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim();
  if (candidate && isValidTimeZone(candidate)) return candidate;
  return CAMPAIGN_SCHEDULER.FALLBACK_TIMEZONE;
}

/** Returns a cached `h23` formatter for the given zone. */
function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 keeps midnight as hour 0; `hour12: false` yields 24 on some runtimes.
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Splits an instant into the calendar fields an observer in `timeZone` sees. */
export function getZonedParts(date: Date, timeZone?: string | null): ZonedDateTimeParts {
  const zone = resolveTimeZone(timeZone);
  const parts = getFormatter(zone).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number.parseInt(found.value, 10) : 0;
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/**
 * Local time-of-day, in minutes past midnight, that `date` corresponds to in
 * `timeZone`. This is the zone-correct replacement for
 * `date.getHours() * 60 + date.getMinutes()`.
 */
export function getZonedMinutesSinceMidnight(date: Date, timeZone?: string | null): number {
  const { hour, minute } = getZonedParts(date, timeZone);
  return hour * 60 + minute;
}

/** Offset of `timeZone` from UTC, in minutes, at the given instant (DST aware). */
export function getTimeZoneOffsetMinutes(date: Date, timeZone?: string | null): number {
  const { year, month, day, hour, minute } = getZonedParts(date, timeZone);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Drop seconds/ms from the instant so only the offset remains in the delta.
  const truncated = Math.floor(date.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  return (asIfUtc - truncated) / MS_PER_MINUTE;
}

/**
 * Resolves a zoneless wall clock ("YYYY-MM-DDTHH:MM") in `timeZone` into an
 * absolute instant. This is what makes "6 PM IST" mean 12:30 UTC regardless of
 * which machine the browser or server happens to be running in.
 *
 * Returns null when the stamp is malformed.
 */
export function zonedWallClockToUtc(wallClock: string, timeZone?: string | null): Date | null {
  const stamp = wallClock?.trim();
  if (!stamp || !CAMPAIGN_SCHEDULER.LOCAL_DATE_TIME_PATTERN.test(stamp)) return null;

  const [datePart, timePart] = stamp.split('T');
  const [year, month, day] = datePart.split('-').map((v) => Number.parseInt(v, 10));
  const [hour, minute] = timePart.split(':').map((v) => Number.parseInt(v, 10));

  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);

  // First pass: guess the offset at the naive instant, then correct. A second
  // pass settles cases where the guess landed on the other side of a DST
  // transition (the offset there differs from the offset at the real instant).
  const firstGuess = asIfUtc - getTimeZoneOffsetMinutes(new Date(asIfUtc), timeZone) * MS_PER_MINUTE;
  const refinedOffset = getTimeZoneOffsetMinutes(new Date(firstGuess), timeZone);
  const resolved = asIfUtc - refinedOffset * MS_PER_MINUTE;

  const result = new Date(resolved);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Formats an instant as the wall clock ("YYYY-MM-DDTHH:MM") seen in `timeZone`. */
export function utcToZonedWallClock(date: Date, timeZone?: string | null): string {
  const { year, month, day, hour, minute } = getZonedParts(date, timeZone);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}
