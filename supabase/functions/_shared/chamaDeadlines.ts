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
