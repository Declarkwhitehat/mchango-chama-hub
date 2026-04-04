const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;
const KENYA_10PM_UTC_HOUR = 19;

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
