/**
 * Client-side timezone helpers, mirroring src/utils/timezone.ts.
 *
 * Campaign start times and call windows are wall-clock values, so every
 * conversion has to name the zone it applies. Relying on the browser's implicit
 * local zone (plain `new Date('2026-08-10T18:00')`) silently bakes in whatever
 * timezone the operator's machine happens to use, which is how a 6 PM IST
 * campaign ended up firing at 11:30 PM IST.
 */

const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;
const FALLBACK_TIMEZONE = 'UTC';

/**
 * The browser's own IANA zone, used as the default selection.
 * @returns {string}
 */
export function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch (_err) {
    return FALLBACK_TIMEZONE;
  }
}

/**
 * @param {string | null | undefined} timeZone
 * @returns {boolean}
 */
export function isValidTimeZone(timeZone) {
  if (!timeZone || !TIMEZONE_PATTERN.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * @param {string | null | undefined} timeZone
 * @returns {string}
 */
export function resolveTimeZone(timeZone) {
  const candidate = timeZone ? String(timeZone).trim() : '';
  return isValidTimeZone(candidate) ? candidate : FALLBACK_TIMEZONE;
}

/**
 * Calendar fields of an instant as seen in `timeZone`.
 * @param {Date} date
 * @param {string | null | undefined} timeZone
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number }}
 */
export function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const read = (/** @type {string} */ type) => {
    const found = parts.find((p) => p.type === type);
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
 * Render an instant as the "YYYY-MM-DDTHH:MM" wall clock seen in `timeZone`,
 * which is exactly what a datetime-local input expects.
 * @param {string | Date | null | undefined} value
 * @param {string | null | undefined} timeZone
 * @returns {string}
 */
export function toZonedDateTimeInput(value, timeZone) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const { year, month, day, hour, minute } = getZonedParts(date, timeZone);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/**
 * Human-readable rendering of an instant in a specific zone, for display only.
 * @param {string | Date | null | undefined} value
 * @param {string | null | undefined} timeZone
 * @returns {string}
 */
export function formatInTimeZone(value, timeZone) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return date.toLocaleString(undefined, { timeZone: resolveTimeZone(timeZone) });
  } catch (_err) {
    return date.toLocaleString();
  }
}

/**
 * The list of zones offered in the picker. Falls back to a small common set
 * when the browser does not expose the full IANA list.
 * @returns {string[]}
 */
export function listTimeZones() {
  try {
    const supported = Intl.supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) return supported;
  } catch (_err) {
    // fall through to the static list
  }
  return [
    'UTC',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Australia/Sydney',
  ];
}
