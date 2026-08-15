// Chama deadline helpers. All calendar/clock maths is delegated to the shared
// Kenya time utility so the UI can never drift from the backend.
import { atKenyaTimeOn, kenyaParts, kenyaDateTime, nextKenyaWeekdayAt, type DateInput } from '@/lib/kenyaTime';
import { normalizeWeeklyDays } from '@/utils/chamaFrequency';

/**
 * FIRST cycle deadline for a twice-weekly chama: always the chama's first
 * chosen weekday at 21:00 EAT. Starting on that weekday rolls a full week.
 * Mirrors `supabase/functions/_shared/chamaDeadlines.ts`.
 */
export function getTwiceWeeklyFirstDeadline(
  input: DateInput,
  day1?: number | null,
  day2?: number | null,
): Date | null {
  const [anchor] = normalizeWeeklyDays(day1, day2);
  return nextKenyaWeekdayAt(input, anchor, 21, 0);
}

/**
 * FIRST cycle deadline for a twice-monthly chama: the next chosen day of the
 * month at 21:00 EAT, rolling into next month when both have passed.
 */
export function getTwiceMonthlyFirstDeadline(
  input: DateInput,
  day1: number,
  day2: number,
): Date | null {
  const parts = kenyaParts(input);
  if (!parts) return null;
  const lo = Math.min(day1, day2);
  const hi = Math.max(day1, day2);
  if (parts.day < lo) return kenyaDateTime(parts.year, parts.month, lo, 21, 0);
  if (parts.day < hi) return kenyaDateTime(parts.year, parts.month, hi, 21, 0);
  return kenyaDateTime(parts.year, parts.month + 1, lo, 21, 0);
}

/** First cycle deadline for any chama frequency, given a start instant. */
export function getFirstCycleDeadline(
  input: DateInput,
  opts: {
    frequency?: string | null;
    monthlyDay?: number | null;
    monthlyDay2?: number | null;
    weeklyDay?: number | null;
    weeklyDay2?: number | null;
  },
): Date | null {
  if (opts.frequency === 'twice_weekly') {
    return getTwiceWeeklyFirstDeadline(input, opts.weeklyDay, opts.weeklyDay2);
  }
  if (opts.frequency === 'twice_monthly' && opts.monthlyDay && opts.monthlyDay2) {
    return getTwiceMonthlyFirstDeadline(input, opts.monthlyDay, opts.monthlyDay2);
  }
  return getNextDay10PmKenyaDeadline(input);
}


/** 9:00 PM EAT the day after `input` — first-cycle payment deadline. */
export function getNextDay10PmKenyaDeadline(input: DateInput): Date | null {
  return atKenyaTimeOn(input, 21, 0, 1);
}

export const getNextDay9PmKenyaDeadline = getNextDay10PmKenyaDeadline;

/** 9:00 PM EAT on the same Kenya day as `input` — cycle deadline & payout time. */
export function getSameDay10PmKenyaCutoff(input: DateInput): Date | null {
  return atKenyaTimeOn(input, 21, 0);
}

/** 9:30 PM EAT on the same Kenya day as `input` — on-time payment cutoff. */
export function getSameDay930PmKenyaCutoff(input: DateInput): Date | null {
  return atKenyaTimeOn(input, 21, 30);
}
