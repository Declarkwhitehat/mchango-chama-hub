const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;
const KENYA_10PM_UTC_HOUR = 19;
const KENYA_930PM_UTC_HOUR = 18;
const KENYA_930PM_UTC_MINUTE = 30;

function toKenyaClock(input: string | Date | null | undefined): Date | null {
  if (!input) return null;

  const sourceDate = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(sourceDate.getTime())) return null;

  return new Date(sourceDate.getTime() + KENYA_OFFSET_MS);
}

function buildKenya10PmCutoff(input: string | Date | null | undefined, dayOffset: number): Date | null {
  const kenyaClock = toKenyaClock(input);
  if (!kenyaClock) return null;

  return new Date(Date.UTC(
    kenyaClock.getUTCFullYear(),
    kenyaClock.getUTCMonth(),
    kenyaClock.getUTCDate() + dayOffset,
    KENYA_10PM_UTC_HOUR,
    0,
    0,
    0,
  ));
}

export function getNextDay10PmKenyaDeadline(input: string | Date | null | undefined): Date | null {
  return buildKenya10PmCutoff(input, 1);
}

export function getSameDay10PmKenyaCutoff(input: string | Date | null | undefined): Date | null {
  return buildKenya10PmCutoff(input, 0);
}

/**
 * 9:30 PM EAT on the same Kenya day as `input`. v2 on-time payment cutoff.
 */
export function getSameDay930PmKenyaCutoff(input: string | Date | null | undefined): Date | null {
  const kenyaClock = toKenyaClock(input);
  if (!kenyaClock) return null;

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
