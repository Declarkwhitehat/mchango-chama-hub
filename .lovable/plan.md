## Goals

1. **Don't show "pending payment"** in a chama that hasn't been officially started (status = `pending`).
2. **Confirm/enforce the grace-period rule**: when a chama starts, the first contribution deadline is **10:00 PM Kenya time the next day** (already implemented). Allow members to contribute starting immediately (≈10+ hours before deadline — already the case).
3. **Send a push notification ~10 hours before the deadline** to all unpaid members on the app.
4. **Send an SMS ~6 hours before the deadline** to unpaid members, warning them they will be removed from the chama if they don't pay in time.

The auto-removal of unpaid members at the 10 PM cutoff is already handled by the existing chama engine (member-auto-removal logic), so this plan focuses on **UI gating + reminders**.

---

## 1. Hide payment UI for unstarted chamas (frontend)

In `src/components/MemberDashboard.tsx`, the `<CyclePaymentStatus>` block (which renders the payment countdown / "Amount to Pay") is shown regardless of `chama.status`. We will gate it so it only renders when `chama.status === 'active'` (or `cycle_complete` with a current cycle). For `status === 'pending'` we will instead show a small informational card:

> "This chama hasn't started yet. Once the manager starts it, you'll have until 10:00 PM the next day to make your first contribution."

Also tighten:
- `src/components/chama/AmountToPayCard.tsx` — early-return a "not started" state if no current cycle exists.
- `src/pages/ChamaDetail.tsx` — make sure none of the payment cards/banners render in the `pending` status branch (they currently shouldn't, but verify the MemberDashboard pathway is the only entry point).

This eliminates the "1 pending payment due" the user is seeing on a freshly created (not-yet-started) chama.

## 2. Grace period (already correct — verify only)

Confirmed in `supabase/functions/chama-start/index.ts` and `supabase/functions/_shared/chamaDeadlines.ts`:
- On start, the first cycle `end_date` is set to `getNextDay10PmKenyaDeadline(startDate)` (next day 22:00 EAT).
- `MemberDashboard` and `PaymentCountdownTimer` already render the grace-period countdown.

No change needed here beyond what's in step 1.

## 3. New edge function: `chama-grace-reminders`

A scheduled function that runs **every 30 minutes** and, for every chama in its first cycle (grace period):

For each unpaid approved member of cycle 1:
- Compute hours remaining until the cycle `end_date` (10 PM Kenya next day).
- **Push notification window — between ~10h and ~9.5h remaining**: insert a row into `notifications` with title "Pay your first contribution today" and body explaining the deadline + amount. The existing `notify_push_on_notification_insert` trigger forwards this to `send-push-notification`, so push delivery is automatic.
- **SMS window — between ~6h and ~5.5h remaining**: call `send-transactional-sms` with: *"⚠️ Pamoja Nova: Your first contribution of KES X for "<chama>" is due by 10:00 PM today. If you don't pay in time, you will be REMOVED from the chama. Pay now via the app."*

To avoid duplicates, add a tiny tracking table:

```text
chama_grace_reminders_sent
  member_id uuid
  cycle_id uuid
  reminder_type text  -- 'push_10h' | 'sms_6h'
  sent_at timestamptz
  PRIMARY KEY (member_id, cycle_id, reminder_type)
```

The function INSERTs into this table inside the same transaction so a re-run of the cron in the same window is a no-op.

## 4. Schedule the cron

Add a `pg_cron` job (via the insert tool, since it embeds the project URL + anon key) to call `chama-grace-reminders` every 30 minutes:

```text
*/30 * * * *  →  POST https://<project>.supabase.co/functions/v1/chama-grace-reminders
```

## 5. Files touched

**Edited**
- `src/components/MemberDashboard.tsx` — gate payment block on `chama.status === 'active'`.
- `src/components/chama/AmountToPayCard.tsx` — show "not started" empty state when no current cycle.

**Created**
- `supabase/functions/chama-grace-reminders/index.ts` — the reminder edge function.
- Migration: create `chama_grace_reminders_sent` table with RLS (service role only).
- pg_cron job (via insert tool) for every-30-min schedule.

## Out of scope

- The actual auto-removal logic at 10 PM cutoff (already handled by the existing chama engine).
- Changing the grace-period length or 10 PM Kenya time policy (already enforced).
