const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;
const KENYA_9PM_UTC_HOUR = 18;        // 21:00 EAT == 18:00 UTC (first-cycle payment cutoff)
const KENYA_10PM_UTC_HOUR = 19;       // 22:00 EAT == 19:00 UTC (payout processor/admin summary runs after cutoff)
const KENYA_930PM_UTC_HOUR = 18;      // 21:30 EAT == 18:30 UTC (on-time cutoff)
const KENYA_930PM_UTC_MINUTE = 30;
const KENYA_1201PM_UTC_HOUR = 9;      // 12:01 PM EAT == 09:01 UTC (grace reminder)
const KENYA_1201PM_UTC_MINUTE = 1;

function toKenyaClock(referenceDate: Date): Date {
  return new Date(referenceDate.getTime() + KENYA_OFFSET_MS);
}

export function getNextDay10PmKenyaDeadline(referenceDate: Date): Date {
  const kenyaClock = toKenyaClock(referenceDate);

  return new Date(Date.UTC(
    kenyaClock.getUTCFullYear(),
    kenyaClock.getUTCMonth(),
    kenyaClock.getUTCDate() + 1,
    KENYA_9PM_UTC_HOUR,
    0,
    0,
    0,
  ));
}

export const getNextDay9PmKenyaDeadline = getNextDay10PmKenyaDeadline;

export function getSameDay10PmKenyaCutoff(referenceDate: Date): Date {
  const kenyaClock = toKenyaClock(referenceDate);

  return new Date(Date.UTC(
    kenyaClock.getUTCFullYear(),
    kenyaClock.getUTCMonth(),
    kenyaClock.getUTCDate(),
    KENYA_10PM_UTC_HOUR,
    0,
    0,
    0,
  ));
}

/**
 * 9:30 PM EAT (18:30 UTC) on the same Kenya-calendar day as `referenceDate`.
 * This is the v2 on-time payment cutoff. Payments received AT OR BEFORE this
 * timestamp count for the current cycle at 5% commission. Payments after this
 * are late (10% commission) and buffered for the next cycle.
 */
export function getSameDay930PmKenyaCutoff(referenceDate: Date): Date {
  const kenyaClock = toKenyaClock(referenceDate);

  return new Date(Date.UTC(
    kenyaClock.getUTCFullYear(),
    kenyaClock.getUTCMonth(),
    kenyaClock.getUTCDate(),
    KENYA_930PM_UTC_HOUR,
    KENYA_930PM_UTC_MINUTE,
    0,
    0,
  ));
}

/**
 * 12:01 PM EAT (09:01 UTC) on the same Kenya-calendar day as `referenceDate`.
 * Used by the first-cycle grace-period courtesy reminder (no amount details).
 */
export function getSameDay1201PmKenyaCutoff(referenceDate: Date): Date {
  const kenyaClock = toKenyaClock(referenceDate);

  return new Date(Date.UTC(
    kenyaClock.getUTCFullYear(),
    kenyaClock.getUTCMonth(),
    kenyaClock.getUTCDate(),
    KENYA_1201PM_UTC_HOUR,
    KENYA_1201PM_UTC_MINUTE,
    0,
    0,
  ));
}

/**
 * 00:01 EAT (21:01 UTC of prior calendar day) on the Kenya-calendar day of `referenceDate`.
 * v2 spec: every cycle's start_date must be 12:01 AM EAT of its calendar day.
 */
export function getEatMidnightOnePastForDate(referenceDate: Date): Date {
  const kenyaClock = toKenyaClock(referenceDate);
  // 00:01 EAT == prior UTC day at 21:01
  return new Date(Date.UTC(
    kenyaClock.getUTCFullYear(),
    kenyaClock.getUTCMonth(),
    kenyaClock.getUTCDate() - 1,
    21,
    1,
    0,
    0,
  ));
}

export interface ChamaCycleSchedule {
  frequency: string;
  everyNDaysCount?: number | null;
  monthlyDay?: number | null;
  monthlyDay2?: number | null;
  /** 0 = Sunday ... 6 = Saturday (twice_weekly) */
  weeklyDay?: number | null;
  weeklyDay2?: number | null;
}

/** Normalises the two chosen weekdays, falling back to Mon/Thu. */
export function normalizeWeeklyDays(
  day1?: number | null,
  day2?: number | null,
): [number, number] {
  const valid = (d?: number | null) =>
    typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6;
  const a = valid(day1) ? (day1 as number) : 1; // Monday
  let b = valid(day2) ? (day2 as number) : 4;   // Thursday
  if (b === a) b = (a + 3) % 7;
  return [a, b];
}


function kenyaDateParts(date: Date) {
  const kenyaClock = toKenyaClock(date);
  return {
    year: kenyaClock.getUTCFullYear(),
    month: kenyaClock.getUTCMonth(),
    day: kenyaClock.getUTCDate(),
  };
}

function atKenyaTime(year: number, month: number, day: number, hour: number, minute = 0) {
  return new Date(Date.UTC(year, month, day, hour - 3, minute, 0, 0));
}

/**
 * Returns the cycle immediately after `lastEndDate` using Kenya calendar dates.
 * All frequencies share this implementation so payout estimates and real cycles
 * cannot drift at month boundaries.
 */
export function getNextChamaCycleWindow(
  lastEndDate: Date,
  schedule: ChamaCycleSchedule,
): { startDate: Date; endDate: Date } {
  const last = kenyaDateParts(lastEndDate);
  const nextCalendarDay = new Date(Date.UTC(last.year, last.month, last.day + 1));
  const nextYear = nextCalendarDay.getUTCFullYear();
  const nextMonth = nextCalendarDay.getUTCMonth();
  const nextDay = nextCalendarDay.getUTCDate();
  const startDate = atKenyaTime(nextYear, nextMonth, nextDay, 0, 1);
  let endYear = nextYear;
  let endMonth = nextMonth;
  let endDay = nextDay;

  switch (schedule.frequency) {
    case 'daily':
      break;
    case 'weekly': {
      const target = new Date(Date.UTC(nextYear, nextMonth, nextDay + 6));
      endYear = target.getUTCFullYear(); endMonth = target.getUTCMonth(); endDay = target.getUTCDate();
      break;
    }
    case 'every_n_days': {
      const length = Math.max(1, schedule.everyNDaysCount || 7);
      const target = new Date(Date.UTC(nextYear, nextMonth, nextDay + length - 1));
      endYear = target.getUTCFullYear(); endMonth = target.getUTCMonth(); endDay = target.getUTCDate();
      break;
    }
    case 'monthly': {
      if (schedule.monthlyDay) {
        const candidate = new Date(Date.UTC(nextYear, nextMonth, schedule.monthlyDay));
        if (candidate < new Date(Date.UTC(nextYear, nextMonth, nextDay))) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
        endYear = candidate.getUTCFullYear(); endMonth = candidate.getUTCMonth(); endDay = candidate.getUTCDate();
      } else {
        const target = new Date(Date.UTC(nextYear, nextMonth + 1, 0));
        endYear = target.getUTCFullYear(); endMonth = target.getUTCMonth(); endDay = target.getUTCDate();
      }
      break;
    }
    case 'twice_monthly': {
      const first = Math.min(schedule.monthlyDay || 1, schedule.monthlyDay2 || 15);
      const second = Math.max(schedule.monthlyDay || 1, schedule.monthlyDay2 || 15);
      let candidate: Date;
      if (nextDay <= first) candidate = new Date(Date.UTC(nextYear, nextMonth, first));
      else if (nextDay <= second) candidate = new Date(Date.UTC(nextYear, nextMonth, second));
      else candidate = new Date(Date.UTC(nextYear, nextMonth + 1, first));
      endYear = candidate.getUTCFullYear(); endMonth = candidate.getUTCMonth(); endDay = candidate.getUTCDate();
      break;
    }
    case 'twice_weekly': {
      const [d1, d2] = normalizeWeeklyDays(schedule.weeklyDay, schedule.weeklyDay2);
      const base = new Date(Date.UTC(nextYear, nextMonth, nextDay));
      const baseDow = base.getUTCDay();
      const delta = (dow: number) => (dow - baseDow + 7) % 7;
      const advance = Math.min(delta(d1), delta(d2));
      const target = new Date(Date.UTC(nextYear, nextMonth, nextDay + advance));
      endYear = target.getUTCFullYear(); endMonth = target.getUTCMonth(); endDay = target.getUTCDate();
      break;
    }
    default: {

      const target = new Date(Date.UTC(nextYear, nextMonth, nextDay + 6));
      endYear = target.getUTCFullYear(); endMonth = target.getUTCMonth(); endDay = target.getUTCDate();
    }
  }

  return { startDate, endDate: atKenyaTime(endYear, endMonth, endDay, 22) };
}

/**
 * For twice-monthly chamas, return the next upcoming chosen contribution day
 * at 21:00 EAT (18:00 UTC). If both chosen days have passed this Kenya month,
 * roll to the earlier day next month.
 */
export function getTwiceMonthlyFirstDeadline(
  referenceDate: Date,
  day1: number,
  day2: number,
): Date {
  const lo = Math.min(day1, day2);
  const hi = Math.max(day1, day2);
  const kenyaClock = toKenyaClock(referenceDate);
  const y = kenyaClock.getUTCFullYear();
  const m = kenyaClock.getUTCMonth();
  const d = kenyaClock.getUTCDate();

  let targetYear = y;
  let targetMonth = m;
  let targetDay: number;

  if (d < lo) {
    targetDay = lo;
  } else if (d < hi) {
    targetDay = hi;
  } else {
    targetDay = lo;
    targetMonth = m + 1;
  }

  return new Date(Date.UTC(targetYear, targetMonth, targetDay, KENYA_9PM_UTC_HOUR, 0, 0, 0));
}

/**
 * For twice-weekly chamas, return the next upcoming chosen weekday at 21:00 EAT
 * (18:00 UTC). Never returns the same Kenya calendar day as `referenceDate`, so
 * members always get at least a full day to pay the first cycle.
 */
export function getTwiceWeeklyFirstDeadline(
  referenceDate: Date,
  day1?: number | null,
  day2?: number | null,
): Date {
  const [d1, d2] = normalizeWeeklyDays(day1, day2);
  const kenyaClock = toKenyaClock(referenceDate);
  const y = kenyaClock.getUTCFullYear();
  const m = kenyaClock.getUTCMonth();
  const d = kenyaClock.getUTCDate();
  const todayDow = kenyaClock.getUTCDay();

  // Distance in days from today to a chosen weekday, at least 1 day away.
  const distance = (dow: number) => {
    const raw = (dow - todayDow + 7) % 7;
    return raw === 0 ? 7 : raw;
  };
  const advance = Math.min(distance(d1), distance(d2));

  return new Date(Date.UTC(y, m, d + advance, KENYA_9PM_UTC_HOUR, 0, 0, 0));
}
