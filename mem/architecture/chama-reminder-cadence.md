---
name: Chama reminder cadence
description: Exactly 2 SMS reminders (1PM, 5PM EAT) and 3 push/in-app reminders (8AM, 11AM, 8PM EAT) for unpaid chama cycles
type: feature
---
Unpaid chama contribution reminders run through `daily-reminder-cron` with a `slot` body param:

- SMS slots (max 2 per day): `1300` (10:00 UTC) first reminder, `1700` (14:00 UTC) final reminder.
- Push + in-app slots (no SMS): `0800` (05:00 UTC), `1100` (08:00 UTC), `2000` (17:00 UTC).
- Welfare cycle reminders fire on push slots only; welfare loan processing runs once a day on the `0800` slot.
- Cron jobs: `daily-reminder-sms-1300-eat`, `daily-reminder-sms-1700-eat`, `daily-reminder-push-0800-eat`, `daily-reminder-push-1100-eat`, `daily-reminder-push-2000-eat`.
- Reminders are skipped during the first 24h of a cycle and after the 9:00 PM EAT deadline.
