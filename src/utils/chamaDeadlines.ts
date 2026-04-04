const KENYA_OFFSET_MS = 3 * 60 * 60 * 1000;
const KENYA_10PM_UTC_HOUR = 19;

export function getNextDay10PmKenyaDeadline(input: string | Date | null | undefined): Date | null {
  if (!input) return null;

  const sourceDate = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(sourceDate.getTime())) return null;

  const kenyaClock = new Date(sourceDate.getTime() + KENYA_OFFSET_MS);

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
