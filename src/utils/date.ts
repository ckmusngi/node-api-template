const UNIT_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

/** Parses durations such as "500ms", "30s", "15m", "24h", "7d" into milliseconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

export function addDuration(date: Date, duration: string | number): Date {
  const ms = typeof duration === 'number' ? duration : parseDuration(duration);
  return new Date(date.getTime() + ms);
}

export function isExpired(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

export function toUnixSeconds(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function startOfDayUtc(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Current time truncated to whole seconds, matching MySQL DATETIME precision. */
export function nowToSecond(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}
