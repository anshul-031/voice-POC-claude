import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  detectTimeZone,
  isValidTimeZone,
  resolveTimeZone,
  getZonedParts,
  toZonedDateTimeInput,
  formatInTimeZone,
  listTimeZones,
} from '../utils/timezone.js';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectTimeZone', () => {
  it('returns the resolved zone reported by Intl', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: IST }),
    } as unknown as Intl.DateTimeFormat);

    expect(detectTimeZone()).toBe(IST);
  });

  it('falls back to UTC when Intl reports no zone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: '' }),
    } as unknown as Intl.DateTimeFormat);

    expect(detectTimeZone()).toBe('UTC');
  });

  it('falls back to UTC when Intl throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no ICU');
    });

    expect(detectTimeZone()).toBe('UTC');
  });
});

describe('isValidTimeZone', () => {
  it('accepts real zones', () => {
    expect(isValidTimeZone(IST)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects malformed, empty and unknown values', () => {
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone('+05:30')).toBe(false);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('resolveTimeZone', () => {
  it('keeps a valid zone and trims it', () => {
    expect(resolveTimeZone(IST)).toBe(IST);
    expect(resolveTimeZone('  Asia/Kolkata ')).toBe(IST);
  });

  it('falls back to UTC for anything unusable', () => {
    expect(resolveTimeZone(null)).toBe('UTC');
    expect(resolveTimeZone('')).toBe('UTC');
    expect(resolveTimeZone('Mars/Olympus')).toBe('UTC');
  });
});

describe('getZonedParts', () => {
  it('reads an instant in the requested zone', () => {
    expect(getZonedParts(new Date('2026-07-07T12:30:00Z'), IST)).toEqual({
      year: 2026, month: 7, day: 7, hour: 18, minute: 0,
    });
  });

  it('defaults to UTC for an unknown zone', () => {
    expect(getZonedParts(new Date('2026-07-07T12:30:00Z'), 'Mars/Olympus').hour).toBe(12);
  });
});

describe('toZonedDateTimeInput', () => {
  it('renders a datetime-local value in the given zone', () => {
    expect(toZonedDateTimeInput('2026-07-07T12:30:00.000Z', IST)).toBe('2026-07-07T18:00');
    expect(toZonedDateTimeInput('2026-07-07T12:30:00.000Z', 'UTC')).toBe('2026-07-07T12:30');
  });

  it('accepts a Date instance', () => {
    expect(toZonedDateTimeInput(new Date('2026-07-07T12:30:00Z'), IST)).toBe('2026-07-07T18:00');
  });

  it('handles daylight saving zones', () => {
    expect(toZonedDateTimeInput('2026-07-07T16:00:00.000Z', NY)).toBe('2026-07-07T12:00');
    expect(toZonedDateTimeInput('2026-01-07T17:00:00.000Z', NY)).toBe('2026-01-07T12:00');
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(toZonedDateTimeInput(null, IST)).toBe('');
    expect(toZonedDateTimeInput(undefined, IST)).toBe('');
    expect(toZonedDateTimeInput('', IST)).toBe('');
    expect(toZonedDateTimeInput('not-a-date', IST)).toBe('');
  });
});

describe('formatInTimeZone', () => {
  it('formats an instant in the requested zone', () => {
    const text = formatInTimeZone('2026-07-07T12:30:00.000Z', IST);
    expect(text).toContain('2026');
    expect(text).not.toBe('');
  });

  it('accepts a Date instance', () => {
    expect(formatInTimeZone(new Date('2026-07-07T12:30:00Z'), 'UTC')).toContain('2026');
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatInTimeZone(null, IST)).toBe('');
    expect(formatInTimeZone('nonsense', IST)).toBe('');
  });

  it('falls back to the default locale rendering when zoned formatting fails', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleString')
      .mockImplementationOnce(() => { throw new RangeError('bad zone'); })
      .mockImplementationOnce(() => 'fallback');

    expect(formatInTimeZone('2026-07-07T12:30:00.000Z', IST)).toBe('fallback');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('listTimeZones', () => {
  it('uses the full IANA list when the runtime exposes it', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([IST, 'UTC']);

    expect(listTimeZones()).toEqual([IST, 'UTC']);
  });

  it('falls back to a common set when the list is empty', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([]);

    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain(IST);
  });

  it('falls back to a common set when the lookup throws', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new RangeError('unsupported');
    });

    expect(listTimeZones()).toContain(IST);
  });
});
