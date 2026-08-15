// Chama deadline helpers. All calendar/clock maths is delegated to the shared
// Kenya time utility so the UI can never drift from the backend.
import { atKenyaTimeOn, type DateInput } from '@/lib/kenyaTime';

/** 9:00 PM EAT the day after `input` — first-cycle payment deadline. */
export function getNextDay10PmKenyaDeadline(input: DateInput): Date | null {
  return atKenyaTimeOn(input, 21, 0, 1);
}

export const getNextDay9PmKenyaDeadline = getNextDay10PmKenyaDeadline;

/** 10:00 PM EAT on the same Kenya day as `input` — cycle deadline. */
export function getSameDay10PmKenyaCutoff(input: DateInput): Date | null {
  return atKenyaTimeOn(input, 22, 0);
}

/** 9:30 PM EAT on the same Kenya day as `input` — on-time payment cutoff. */
export function getSameDay930PmKenyaCutoff(input: DateInput): Date | null {
  return atKenyaTimeOn(input, 21, 30);
}
