---
name: Chama payouts run at 21:00 EAT, never early
description: Every chama cycle closes and pays out at 9:00 PM EAT on its payout day whether or not all members have paid; instant/early payouts are removed
type: feature
---

**Single payout moment:** every chama cycle's `end_date` is 21:00 EAT (18:00 UTC) on its payout day, and `daily-payout-cron` (cron `daily-payout-2100-eat`, 18:05 UTC) creates and sends the payout at that time — regardless of how many members paid. Whatever is collected is paid to the scheduled beneficiary; non-payers get debts (principal + 10% penalty) and deficits as before.

**Removed paths (must never come back):**
- `early-payout-cron` (7 PM all-paid accelerator) — now a no-op, cron unscheduled.
- Inline "all members paid → immediate payout" blocks in `c2b-confirm-payment`, `contributions-crud`.
- `_shared/completeCycleIfPaid.ts` helper and its call in `payment-stk-callback` — deleted.
- DB trigger `trigger_immediate_payout` only refreshes counters; it never sets `is_complete` or creates withdrawals.

**Cutoffs:** first-cycle cutoff, on-time cutoff and cycle deadline are all 21:00 EAT. `KENYA_CUTOFFS.cycleDeadline`/`onTimeCutoff` = 21:00 in both `src/lib/kenyaTime.ts` and `supabase/functions/_shared/kenyaTime.ts`. Last-call reminder cron moved to 20:00 EAT.

**No cycle-age grace:** `daily-payout-cron` pays any cycle whose 21:00 deadline has passed (the old 23-hour "too new" skip was removed so daily and twice-weekly cycles pay out on their own day).
