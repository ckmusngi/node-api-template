import { addDuration, isExpired, parseDuration, startOfDayUtc, toIso, toUnixSeconds } from '../../src/utils/date';

describe('date utils', () => {
  it('parses durations', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('24h')).toBe(86_400_000);
    expect(parseDuration('7d')).toBe(604_800_000);
  });

  it('rejects invalid durations', () => {
    expect(() => parseDuration('15 minutes')).toThrow('Invalid duration');
    expect(() => parseDuration('-1s')).toThrow();
  });

  it('adds durations and detects expiry', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    expect(addDuration(base, '1h').toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(addDuration(base, 1000).getTime()).toBe(base.getTime() + 1000);
    expect(isExpired(new Date(Date.now() - 1))).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false);
    expect(isExpired(null)).toBe(false);
  });

  it('formats dates', () => {
    expect(toUnixSeconds(new Date('1970-01-01T00:01:00Z'))).toBe(60);
    expect(toIso(null)).toBeNull();
    expect(startOfDayUtc(new Date('2026-03-05T17:45:00Z')).toISOString()).toBe('2026-03-05T00:00:00.000Z');
  });
});
