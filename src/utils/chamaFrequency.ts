import {
  addKenyaDays,
  kenyaDateTime,
  kenyaParts,
  nextKenyaWeekdayOfPairAt,
} from "@/lib/kenyaTime";

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Normalises the two chosen weekdays, falling back to Mon/Thu. */
export function normalizeWeeklyDays(
  day1?: number | null,
  day2?: number | null,
): [number, number] {
  const valid = (d?: number | null) =>
    typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6;
  const a = valid(day1) ? (day1 as number) : 1;
  let b = valid(day2) ? (day2 as number) : 4;
  if (b === a) b = (a + 3) % 7;
  return [a, b];
}

export function frequencyLabel(
  frequency: string | null | undefined,
  everyNDaysCount?: number | null,
  weeklyDay?: number | null,
  weeklyDay2?: number | null,
): string {
  switch (frequency) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "twice_monthly":
      return "Twice Monthly";
    case "twice_weekly": {
      if (
        typeof weeklyDay === "number" &&
        typeof weeklyDay2 === "number" &&
        weeklyDay >= 0 &&
        weeklyDay2 >= 0
      ) {
        const [a, b] = normalizeWeeklyDays(weeklyDay, weeklyDay2);
        return `Twice a Week (${WEEKDAY_NAMES[a].slice(0, 3)} & ${WEEKDAY_NAMES[b].slice(0, 3)})`;
      }
      return "Twice a Week";
    }
    case "every_n_days":
      return everyNDaysCount && everyNDaysCount > 0
        ? `Every ${everyNDaysCount} Days`
        : "Every N Days";
    default:
      return frequency ? frequency.replace(/_/g, " ") : "Contribution";
  }
}

interface ChamaScheduleOpts {
  frequency: string;
  everyNDaysCount?: number | null;
  monthlyDay?: number | null;
  monthlyDay2?: number | null;
  /** 0 = Sunday ... 6 = Saturday (twice_weekly) */
  weeklyDay?: number | null;
  weeklyDay2?: number | null;
}

function deadlineAtKenyaDay(year: number, month: number, day: number): Date {
  // 21:00 EAT on the given Kenya calendar day.
  return kenyaDateTime(year, month, day, 21, 0);
}

/**
 * Given the END date of a cycle, return the END date of the cycle `cyclesAhead` later.
 * Honours twice_monthly chosen-day pairs and monthly chosen-day schedules.
 */
export function addCyclesToDeadline(
  fromDeadline: Date,
  cyclesAhead: number,
  opts: ChamaScheduleOpts,
): Date {
  if (cyclesAhead <= 0) return new Date(fromDeadline);

  const { frequency, everyNDaysCount, monthlyDay, monthlyDay2, weeklyDay, weeklyDay2 } = opts;

  // Twice-weekly: hop to the next chosen weekday, alternating between the two.
  if (frequency === "twice_weekly") {
    const [d1, d2] = normalizeWeeklyDays(weeklyDay, weeklyDay2);
    let cursor: Date = fromDeadline;
    for (let i = 0; i < cyclesAhead; i++) {
      cursor = nextKenyaWeekdayOfPairAt(cursor, d1, d2, 21, 0)!;
    }
    return cursor;
  }

  // Twice-monthly with two chosen days: alternate between the two days.
  if (frequency === "twice_monthly" && monthlyDay && monthlyDay2) {
    const days = [monthlyDay, monthlyDay2].sort((a, b) => a - b);
    const kenya = kenyaParts(fromDeadline)!;
    let year = kenya.year;
    let month = kenya.month;
    let dayIdx = days.indexOf(kenya.day);
    if (dayIdx === -1) {
      // fromDeadline isn't on a chosen day — snap to the earliest chosen day from now.
      dayIdx = 0;
    }
    for (let i = 0; i < cyclesAhead; i++) {
      dayIdx += 1;
      if (dayIdx >= days.length) {
        dayIdx = 0;
        month += 1;
        if (month > 11) { month = 0; year += 1; }
      }
    }
    return deadlineAtKenyaDay(year, month, days[dayIdx]);
  }

  // Monthly with chosen day.
  if (frequency === "monthly" && monthlyDay) {
    const kenya = kenyaParts(fromDeadline)!;
    let year = kenya.year;
    let month = kenya.month + cyclesAhead;
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
    return deadlineAtKenyaDay(year, month, monthlyDay);
  }

  // Day-based frequencies — add N * cycleLength Kenya days.
  let cycleLength: number;
  switch (frequency) {
    case "daily": cycleLength = 1; break;
    case "weekly": cycleLength = 7; break;
    case "monthly": cycleLength = 30; break;
    case "every_n_days": cycleLength = everyNDaysCount || 7; break;
    default: cycleLength = 7;
  }
  return addKenyaDays(fromDeadline, cyclesAhead * cycleLength)!;
}

