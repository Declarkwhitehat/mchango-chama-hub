const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;
const KENYA_10PM_UTC_HOUR = 19;       // 22:00 EAT == 19:00 UTC (cycle close / payout)
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
    KENYA_10PM_UTC_HOUR,
    0,
    0,
    0,
  ));
}

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
