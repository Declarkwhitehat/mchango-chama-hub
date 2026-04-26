## Why push notifications are not arriving

Investigation findings:

1. **Device tokens are registered correctly** — the user has multiple FCM tokens stored in `device_tokens` (most recent today).
2. **The `send-push-notification` edge function has never been called** — its logs are completely empty. The push pipeline is plumbed (DB trigger → edge function → FCM HTTP v1) but the trigger only fires when a row is inserted into `public.notifications`.
3. **The payment-success code paths are not inserting notification rows.** The `notifications` table has no entries newer than April 5; recent payments and withdrawals never wrote to it. Specifically:
   - `payment-stk-callback` (chama contributions) → only sends an SMS, no notification row.
   - `payment-stk-callback` (mchango / organization donations) → no notification at all (neither donor nor campaign owner).
   - `c2b-confirm-payment` (offline PayBill donations) → only sends SMS to the donor; campaign owner not notified.
   - `b2c-callback` (withdrawal completion) → no notification when M‑Pesa actually pays out.
   - Reminder cron jobs (`daily-reminder-cron`, `daily-payout-cron`) write reminders but those rows are old.

So the fix is **not** in the FCM/Firebase plumbing — that part is correct. The fix is to insert a `notifications` row at every transaction event, which automatically fans out a push via the existing trigger.

## Plan

### 1. Add notifications on every payment success (chama contributions)

In `supabase/functions/payment-stk-callback/index.ts`, when `status === 'completed'` for a chama contribution, also call `createNotification(...)` for:
- The payer (always) — "Payment Confirmed ✅ KES X to {chama}. Receipt: {ref}".
- The beneficiary, if someone else paid for them — "{Payer} paid KES X for your contribution".

### 2. Add notifications for donations (mchango + organizations)

In **both** `payment-stk-callback` and `c2b-confirm-payment`:
- Notify the **donor** if they have a Pamoja account (lookup by phone in `profiles`) — "Donation received ✅ KES X to {campaign}".
- Notify the **campaign creator / organization owner / additional managers** — "💝 New donation: {donor} gave KES X to {campaign}".
- Notify the campaign creator on **paid contributions to chamas** they manage (manager visibility) — only when relevant.

### 3. Add notifications when a withdrawal actually pays out

In `supabase/functions/b2c-callback/index.ts`, on M‑Pesa B2C `ResultCode === 0`:
- Notify the requester — "Withdrawal Complete ✅ KES X sent to your M‑Pesa. Ref: {receipt}".
- For mchango/organization withdrawals, also notify all donors that funds were withdrawn (best‑effort, deduplicated by `user_id`) using the existing `campaignWithdrawal` template.

### 4. Add reminder push for due payments

The `daily-reminder-cron` and `daily-payout-cron` already insert notification rows, so they will get push automatically once the trigger is in place — verify the trigger is active (`notifications_push_after_insert`) and re-deploy if needed.

### 5. Android notification channel

Create the `transactions` notification channel referenced in `send-push-notification` (`channel_id: 'transactions'`) so high‑priority banners + sound work on Android 8+. Add a small native bootstrap call in `usePushNotifications.ts` using `PushNotifications.createChannel(...)` immediately after registration.

### 6. Verification step

After deploying, perform a small donation/contribution end‑to‑end and confirm:
- A `notifications` row appears.
- `send-push-notification` logs show a 200 from FCM.
- The Android device shows a heads‑up banner.

## Files to touch

- `supabase/functions/payment-stk-callback/index.ts` — add `createNotification` calls for chama payer/beneficiary, mchango donor + creator + managers, organization donor + creator.
- `supabase/functions/c2b-confirm-payment/index.ts` — add notifications for mchango and organization offline donations (donor + creator).
- `supabase/functions/b2c-callback/index.ts` — add `withdrawalCompleted` notification + donor fan‑out for campaign withdrawals.
- `supabase/functions/_shared/notifications.ts` — add a small `notifyManyUsers(...)` helper that dedupes user IDs to send the same notification to a list (for donor fan‑out).
- `src/hooks/usePushNotifications.ts` — register a `transactions` Android notification channel on init so the channel referenced by `send-push-notification` exists.

No DB schema changes are needed — the trigger and FCM service account are already in place.
