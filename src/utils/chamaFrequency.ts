export function frequencyLabel(
  frequency: string | null | undefined,
  everyNDaysCount?: number | null,
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
    case "every_n_days":
      return everyNDaysCount && everyNDaysCount > 0
        ? `Every ${everyNDaysCount} Days`
        : "Every N Days";
    default:
      return frequency ? frequency.replace(/_/g, " ") : "Contribution";
  }
}

const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DEADLINE_UTC_HOUR = 18; // 21:00 EAT

interface ChamaScheduleOpts {
  frequency: string;
  everyNDaysCount?: number | null;
  monthlyDay?: number | null;
  monthlyDay2?: number | null;
}

function deadlineAtKenyaDay(year: number, month: number, day: number): Date {
  // 21:00 EAT == 18:00 UTC on the same Kenya calendar day.
  return new Date(Date.UTC(year, month, day, DEADLINE_UTC_HOUR, 0, 0, 0));
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

  const { frequency, everyNDaysCount, monthlyDay, monthlyDay2 } = opts;

  // Twice-monthly with two chosen days: alternate between the two days.
  if (frequency === "twice_monthly" && monthlyDay && monthlyDay2) {
    const days = [monthlyDay, monthlyDay2].sort((a, b) => a - b);
    // Express fromDeadline in Kenya clock to know which chosen day it is.
    const kenya = new Date(fromDeadline.getTime() + KENYA_OFFSET_MS);
    let year = kenya.getUTCFullYear();
    let month = kenya.getUTCMonth();
    let dayIdx = days.indexOf(kenya.getUTCDate());
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
    const kenya = new Date(fromDeadline.getTime() + KENYA_OFFSET_MS);
    let year = kenya.getUTCFullYear();
    let month = kenya.getUTCMonth() + cyclesAhead;
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
    return deadlineAtKenyaDay(year, month, monthlyDay);
  }

  // Day-based frequencies — add N * cycleLength days.
  let cycleLength: number;
  switch (frequency) {
    case "daily": cycleLength = 1; break;
    case "weekly": cycleLength = 7; break;
    case "monthly": cycleLength = 30; break;
    case "every_n_days": cycleLength = everyNDaysCount || 7; break;
    default: cycleLength = 7;
  }
  const result = new Date(fromDeadline);
  result.setUTCDate(result.getUTCDate() + cyclesAhead * cycleLength);
  return result;
}

