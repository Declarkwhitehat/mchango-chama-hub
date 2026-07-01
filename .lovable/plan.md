# Plan: Campaign Ending-Soon Notification

Send an SMS + push notification to a Mchango campaign creator when their campaign has 1 day or less remaining (including on the day it expires).

## Behavior

- **Trigger 1 — "24 hours left"**: When `end_date` is between now and now + 24h, send once.
- **Trigger 2 — "Ends today / 0 days"**: When `end_date` is within the current day (≤ ~6h remaining), send once.
- **Only** for campaigns with `status = 'active'` and `is_public = true`.
- Never send twice for the same trigger on the same campaign (dedupe).

## Implementation

### 1. New table `mchango_expiry_reminders_sent`
Tracks which reminder type has been sent per campaign.
Columns: `campaign_id`, `reminder_type` ('24h' | 'final'), `sent_at`. Unique on (`campaign_id`, `reminder_type`).

### 2. New edge function `mchango-expiry-reminders`
- Query active public mchango where `end_date` is within next 24h.
- For each, check `mchango_expiry_reminders_sent`:
  - If no '24h' row → send "Your campaign X ends in less than 24 hours" SMS + push to creator, insert row.
  - If `end_date` is within 6h and no 'final' row → send "Your campaign X ends today" SMS + push, insert row.
- Uses existing Onfon SMS helper pattern and `notifications` table for push.

### 3. Cron
`pg_cron` every 1 hour invoking the edge function.

## SMS copy (GSM-7, no emojis)
- 24h: `Hi {name}, your campaign "{title}" ends in less than 24 hours. Share the link to boost donations: {url} - PAMOJA NOVA`
- Final: `Hi {name}, your campaign "{title}" ends today. Withdraw funds once it closes. - PAMOJA NOVA`

## Files
- Migration: create `mchango_expiry_reminders_sent` + grants + RLS (service_role only) + cron schedule.
- `supabase/functions/mchango-expiry-reminders/index.ts` — new function.
