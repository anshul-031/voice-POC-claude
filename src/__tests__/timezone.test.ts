import { describe, it, expect } from 'vitest';
import {
  isValidTimeZone,
  resolveTimeZone,
  getZonedParts,
  getZonedMinutesSinceMidnight,
  getTimeZoneOffsetMinutes,
  zonedWallClockToUtc,
  utcToZonedWallClock,
} from '../utils/timezone.js';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

describe('isValidTimeZone', () => {
  it('accepts real IANA zones', () => {
    expect(isValidTimeZone(IST)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
  });

  it('rejects empty and malformed values', () => {
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('+05:30')).toBe(false);
    expect(isValidTimeZone('Asia/Kolkata; DROP TABLE campaigns')).toBe(false);
    expect(isValidTimeZone('a/'.repeat(40))).toBe(false);
  });

  it('rejects well-formed but unknown zones', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('returns the cached answer on repeat lookups', () => {
    expect(isValidTimeZone(IST)).toBe(true);
    expect(isValidTimeZone(IST)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('resolveTimeZone', () => {
  it('keeps a valid zone', () => {
    expect(resolveTimeZone(IST)).toBe(IST);
    expect(resolveTimeZone('  Asia/Kolkata  ')).toBe(IST);
  });

  it('falls back to UTC rather than the process timezone', () => {
    expect(resolveTimeZone(null)).toBe('UTC');
    expect(resolveTimeZone(undefined)).toBe('UTC');
    expect(resolveTimeZone('')).toBe('UTC');
    expect(resolveTimeZone('Mars/Olympus')).toBe('UTC');
  });
});

describe('getZonedParts', () => {
  it('reads an instant as the calendar fields of the zone', () => {
    // 12:30 UTC is 18:00 on 7 July in IST.
    expect(getZonedParts(new Date('2026-07-07T12:30:00Z'), IST)).toEqual({
      year: 2026, month: 7, day: 7, hour: 18, minute: 0,
    });
  });

  it('rolls the date over when the zone is ahead', () => {
    expect(getZonedParts(new Date('2026-07-07T20:00:00Z'), IST)).toEqual({
      year: 2026, month: 7, day: 8, hour: 1, minute: 30,
    });
  });

  it('keeps midnight as hour 0', () => {
    expect(getZonedParts(new Date('2026-07-07T00:00:00Z'), 'UTC').hour).toBe(0);
  });

  it('uses UTC for an unknown zone', () => {
    expect(getZonedParts(new Date('2026-07-07T12:30:00Z'), 'Mars/Olympus').hour).toBe(12);
  });
});

describe('getZonedMinutesSinceMidnight', () => {
  it('returns local minutes past midnight in the given zone', () => {
    const instant = new Date('2026-07-07T12:30:00Z');
    expect(getZonedMinutesSinceMidnight(instant, IST)).toBe(18 * 60);
    expect(getZonedMinutesSinceMidnight(instant, 'UTC')).toBe(12 * 60 + 30);
  });
});

describe('getTimeZoneOffsetMinutes', () => {
  it('reports fixed offsets', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-07T12:30:00Z'), IST)).toBe(330);
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-07T12:30:00Z'), 'UTC')).toBe(0);
  });

  it('tracks daylight saving transitions', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-07T12:00:00Z'), NY)).toBe(-240);
    expect(getTimeZoneOffsetMinutes(new Date('2026-01-07T12:00:00Z'), NY)).toBe(-300);
  });

  it('ignores sub-minute components of the instant', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-07T12:30:45.678Z'), IST)).toBe(330);
  });
});

describe('zonedWallClockToUtc', () => {
  it('resolves 6 PM IST to 12:30 UTC', () => {
    expect(zonedWallClockToUtc('2026-07-07T18:00', IST)?.toISOString())
      .toBe('2026-07-07T12:30:00.000Z');
  });

  it('resolves a UTC wall clock unchanged', () => {
    expect(zonedWallClockToUtc('2026-07-07T18:00', 'UTC')?.toISOString())
      .toBe('2026-07-07T18:00:00.000Z');
  });

  it('handles both sides of a daylight saving change', () => {
    expect(zonedWallClockToUtc('2026-07-07T12:00', NY)?.toISOString())
      .toBe('2026-07-07T16:00:00.000Z');
    expect(zonedWallClockToUtc('2026-01-07T12:00', NY)?.toISOString())
      .toBe('2026-01-07T17:00:00.000Z');
  });

  it('resolves a time that the spring-forward gap skips', () => {
    // 02:30 never happens on this date in New York; the two-pass offset lookup
    // must still return a usable instant rather than NaN.
    expect(zonedWallClockToUtc('2026-03-08T02:30', NY)?.toISOString())
      .toBe('2026-03-08T06:30:00.000Z');
  });

  it('picks a consistent instant for an ambiguous fall-back hour', () => {
    expect(zonedWallClockToUtc('2026-11-01T01:30', NY)?.toISOString())
      .toBe('2026-11-01T05:30:00.000Z');
  });

  it('crosses midnight and month boundaries', () => {
    expect(zonedWallClockToUtc('2026-08-01T02:00', IST)?.toISOString())
      .toBe('2026-07-31T20:30:00.000Z');
  });

  it('defaults to UTC when no zone is supplied', () => {
    expect(zonedWallClockToUtc('2026-07-07T18:00')?.toISOString())
      .toBe('2026-07-07T18:00:00.000Z');
  });

  it('returns null for malformed input', () => {
    expect(zonedWallClockToUtc('', IST)).toBeNull();
    expect(zonedWallClockToUtc('2026-07-07', IST)).toBeNull();
    expect(zonedWallClockToUtc('2026-07-07T25:00', IST)).toBeNull();
    expect(zonedWallClockToUtc('07/07/2026 18:00', IST)).toBeNull();
    expect(zonedWallClockToUtc(undefined as unknown as string, IST)).toBeNull();
  });
});

describe('utcToZonedWallClock', () => {
  it('renders the wall clock an observer in the zone sees', () => {
    expect(utcToZonedWallClock(new Date('2026-07-07T12:30:00Z'), IST)).toBe('2026-07-07T18:00');
    expect(utcToZonedWallClock(new Date('2026-07-07T12:30:00Z'), 'UTC')).toBe('2026-07-07T12:30');
  });

  it('round-trips with zonedWallClockToUtc', () => {
    const wallClock = '2026-07-07T18:00';
    const instant = zonedWallClockToUtc(wallClock, IST) as Date;
    expect(utcToZonedWallClock(instant, IST)).toBe(wallClock);
  });
});
