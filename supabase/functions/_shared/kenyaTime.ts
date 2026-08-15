/**
 * kenyaTime — the single source of truth for every date/time calculation in
 * PAMOJA NOVA.
 *
 * Kenya (Africa/Nairobi) is permanently UTC+3 with no daylight saving, so the
 * whole system pins to that offset. Nothing in the codebase should do its own
 * `+ 3 * 60 * 60 * 1000` maths, read `getFullYear()` off a raw Date, or format
 * with the server/browser locale — all of those drift on timezone, day-of-week,
 * month and year boundaries. Use these helpers instead.
 *
 * Vocabulary:
 *  - "instant"      — a real `Date` (UTC under the hood).
 *  - "Kenya parts"  — the year / month / day / hour / minute / weekday a person
 *                     in Nairobi would read off the wall clock at that instant.
 */

export const KENYA_TIMEZONE = 'Africa/Nairobi';
export const KENYA_UTC_OFFSET_HOURS = 3;
export const KENYA_OFFSET_MS = KENYA_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/** Standard platform cut-offs, expressed on the Kenya wall clock. */
export const KENYA_CUTOFFS = {
  /** 00:01 EAT — canonical cycle start. */
  cycleStart: { hour: 0, minute: 1 },
  /** 12:01 PM EAT — grace-period courtesy reminder. */
  graceReminder: { hour: 12, minute: 1 },
  /** 9:00 PM EAT — first-cycle payment cutoff. */
  firstCycleCutoff: { hour: 21, minute: 0 },
  /** 9:00 PM EAT — on-time payment cutoff (same instant as the payout). */
  onTimeCutoff: { hour: 21, minute: 0 },
  /** 9:00 PM EAT — cycle deadline / payout processing. */
  cycleDeadline: { hour: 21, minute: 0 },
} as const;

export interface KenyaParts {
  /** Full year on the Kenya calendar. */
  year: number;
  /** 0-indexed month (0 = January), matching `Date#getMonth`. */
  month: number;
  /** Day of month, 1-31. */
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday, on the Kenya calendar. */
  weekday: number;
}

export type DateInput = Date | string | number | null | undefined;

/** Coerces any accepted input into a valid `Date`, or `null`. */
export function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The current instant. Always go through this so tests/logs stay consistent. */
export function nowUtc(): Date {
  return new Date();
}

/**
 * Shifts an instant so its UTC getters read the Kenya wall clock.
 * Internal helper — prefer {@link kenyaParts}.
 */
function shiftToKenyaClock(date: Date): Date {
  return new Date(date.getTime() + KENYA_OFFSET_MS);
}

/** Breaks an instant into the calendar values a person in Nairobi would read. */
export function kenyaParts(input: DateInput = nowUtc()): KenyaParts | null {
  const date = toDate(input);
  if (!date) return null;
  const clock = shiftToKenyaClock(date);
  return {
    year: clock.getUTCFullYear(),
    month: clock.getUTCMonth(),
    day: clock.getUTCDate(),
    hour: clock.getUTCHours(),
    minute: clock.getUTCMinutes(),
    second: clock.getUTCSeconds(),
    weekday: clock.getUTCDay(),
  };
}

/**
 * Builds the instant for a Kenya wall-clock date/time. Out-of-range values roll
 * over exactly like `Date.UTC` (day 32 → next month, month 12 → next year), so
 * arithmetic never lands on an invalid date.
 */
export function kenyaDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, month, day, hour - KENYA_UTC_OFFSET_HOURS, minute, second, 0));
}

/** The instant of `hour:minute` Kenya time on the same Kenya day as `input`. */
export function atKenyaTimeOn(
  input: DateInput,
  hour: number,
  minute = 0,
  dayOffset = 0,
): Date | null {
  const parts = kenyaParts(input);
  if (!parts) return null;
  return kenyaDateTime(parts.year, parts.month, parts.day + dayOffset, hour, minute);
}

/** Start of the Kenya calendar day (00:00 EAT) containing `input`. */
export function startOfKenyaDay(input: DateInput = nowUtc()): Date | null {
  return atKenyaTimeOn(input, 0, 0);
}

/** End of the Kenya calendar day (23:59:59 EAT) containing `input`. */
export function endOfKenyaDay(input: DateInput = nowUtc()): Date | null {
  const parts = kenyaParts(input);
  if (!parts) return null;
  return kenyaDateTime(parts.year, parts.month, parts.day, 23, 59, 59);
}

/** Adds whole Kenya calendar days, preserving the wall-clock time of day. */
export function addKenyaDays(input: DateInput, days: number): Date | null {
  const parts = kenyaParts(input);
  if (!parts) return null;
  return kenyaDateTime(
    parts.year,
    parts.month,
    parts.day + days,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

/** Adds whole Kenya calendar months, clamping to the last valid day. */
export function addKenyaMonths(input: DateInput, months: number): Date | null {
  const parts = kenyaParts(input);
  if (!parts) return null;
  const targetMonthDays = kenyaDaysInMonth(parts.year, parts.month + months);
  return kenyaDateTime(
    parts.year,
    parts.month + months,
    Math.min(parts.day, targetMonthDays),
    parts.hour,
    parts.minute,
    parts.second,
  );
}

/** Number of days in a Kenya calendar month (month may be out of 0-11 range). */
export function kenyaDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `YYYY-MM-DD` for the Kenya calendar day containing `input`. */
export function kenyaDateKey(input: DateInput = nowUtc()): string | null {
  const parts = kenyaParts(input);
  if (!parts) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}`;
}

/** True when both instants fall on the same Kenya calendar day. */
export function isSameKenyaDay(a: DateInput, b: DateInput): boolean {
  const keyA = kenyaDateKey(a);
  const keyB = kenyaDateKey(b);
  return keyA !== null && keyA === keyB;
}

/** Whole Kenya calendar days between two instants (b - a). */
export function kenyaDaysBetween(a: DateInput, b: DateInput): number | null {
  const startA = startOfKenyaDay(a);
  const startB = startOfKenyaDay(b);
  if (!startA || !startB) return null;
  return Math.round((startB.getTime() - startA.getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, on the Kenya calendar. */
export function kenyaWeekday(input: DateInput = nowUtc()): number | null {
  return kenyaParts(input)?.weekday ?? null;
}

export const KENYA_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const KENYA_WEEKDAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Name of a 0-6 weekday index, e.g. `4 -> "Thursday"`. */
export function weekdayName(index: number, short = false): string {
  const list = short ? KENYA_WEEKDAY_SHORT_NAMES : KENYA_WEEKDAY_NAMES;
  return list[((index % 7) + 7) % 7];
}

/**
 * The next occurrence of `weekday` (0-6) strictly after `input`, at the given
 * Kenya wall-clock time. Used by weekly / twice-weekly chama schedules.
 */
export function nextKenyaWeekdayAt(
  input: DateInput,
  weekday: number,
  hour: number = KENYA_CUTOFFS.cycleDeadline.hour,
  minute = 0,
): Date | null {
  const parts = kenyaParts(input);
  if (!parts) return null;
  const target = ((weekday % 7) + 7) % 7;
  let advance = (target - parts.weekday + 7) % 7;
  if (advance === 0) advance = 7;
  return kenyaDateTime(parts.year, parts.month, parts.day + advance, hour, minute);
}

/**
 * The soonest of two chosen weekdays strictly after `input` (twice-weekly).
 */
export function nextKenyaWeekdayOfPairAt(
  input: DateInput,
  weekdayA: number,
  weekdayB: number,
  hour: number = KENYA_CUTOFFS.cycleDeadline.hour,
  minute = 0,
): Date | null {
  const first = nextKenyaWeekdayAt(input, weekdayA, hour, minute);
  const second = nextKenyaWeekdayAt(input, weekdayB, hour, minute);
  if (!first) return second;
  if (!second) return first;
  return first.getTime() <= second.getTime() ? first : second;
}

/** Formats an instant on the Kenya clock, e.g. "15 Aug 2026, 14:35". */
export function formatKenya(
  input: DateInput,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
): string {
  const date = toDate(input);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-KE', { ...options, timeZone: KENYA_TIMEZONE }).format(date);
}

/** Date-only Kenya formatting, e.g. "15 Aug 2026". */
export function formatKenyaDate(input: DateInput): string {
  return formatKenya(input, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Time-only Kenya formatting, e.g. "22:00". */
export function formatKenyaTime(input: DateInput): string {
  return formatKenya(input, { hour: '2-digit', minute: '2-digit', hour12: false });
}
