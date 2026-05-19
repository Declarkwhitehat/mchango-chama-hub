
## 1. "Today's Pool" tile for Daily chamas

On the chama detail page (`src/pages/ChamaDetail.tsx`) and `MemberDashboard.tsx`, add a new tile shown ONLY when `contribution_frequency === 'daily'`:

- **Label:** "Today's Pool"
- **Value:** sum of NET contributions for the current open cycle (the cycle whose `start_date <= now <= end_date`) → this is exactly what gets sent out as the payout
- **Subtext:** `{x}/{n} members paid · Target KES {n × contribution_amount × (1 - commission)}`
- Source: `member_cycle_payments` for `cycle_id = current_cycle.id`, sum `amount_paid` capped at `amount_due` per member (so overpayments never inflate the displayed pool).

Existing "Total Contribution" tile keeps its meaning (lifetime gross collected).

For weekly/monthly etc. the tile label becomes "This Cycle's Pool" (same logic) — minor nicety; reusing one component.

New component: `src/components/chama/CurrentCyclePool.tsx`.

## 2. Overpayment routing — only correct amount enters pool

Already partially enforced via `chama_overpayment_wallet`. Audit + tighten in `supabase/functions/c2b-confirm-payment/index.ts` and `payment-stk-callback/index.ts` so the per-cycle settlement logic:

1. Computes `cycle_net_target = contribution_amount × (1 - rate)`.
2. Applies incoming net up to `cycle_net_target − already_paid_for_cycle` to `member_cycle_payments.amount_paid`.
3. Sends any remainder to `chama_overpayment_wallet` (status `pending`) — never inflates `member_cycle_payments` or the pool figure.

This guarantees the "Today's Pool" tile reflects only what will be paid out.

## 3. Freeze instead of remove after 3 missed payments

Replace auto-removal in `supabase/functions/daily-payout-cron/index.ts` (the two removal sites around lines 505–545 and 1135–1175) with a freeze flow.

### Schema (migration)

- Add enum value `frozen` to `member_status`.
- Add columns to `chama_members`:
  - `frozen_at timestamptz`
  - `frozen_amount_due numeric` — snapshot of outstanding at freeze time
  - `frozen_unfreeze_fee numeric` — `frozen_amount_due × 0.10`
  - `unfrozen_at timestamptz`

### Behavior

- When `missed_payments_count >= 3`: set `status = 'frozen'`, snapshot outstanding into `frozen_amount_due`, compute `frozen_unfreeze_fee = round(frozen_amount_due * 0.10)`. Skip them in payout rotation (they don't receive turns and don't get removed).
- Push + SMS to the frozen member: "You're frozen. Pay KES {due + fee} to resume."
- Auto-unfreeze trigger (DB trigger on `member_cycle_payments` settlement OR check in settlement engine after each chama payment): once cumulative settled amount ≥ `frozen_amount_due + frozen_unfreeze_fee`, flip `status = 'active'`, set `unfrozen_at`, reset `missed_payments_count = 0`, log audit + notify member.
- The 10% unfreeze fee is recorded as commission/company_earnings (consistent with late-payment commission flow).

### UI

- `MemberDashboard.tsx`: if `status === 'frozen'`, render a red banner showing `frozen_amount_due`, `frozen_unfreeze_fee`, total payable, Paybill + member_code. Hide normal cycle UI.
- `ChamaDetail.tsx` members list: badge "Frozen" with amount owed; managers see same.
- `PaymentAllocationPreview` accounts for frozen settlement first.

## 4. Manager SMS at cycle-end summary

In `supabase/functions/daily-payout-cron/index.ts`, at the point where a cycle is closed and the beneficiary is paid out, after determining paid/unpaid members:

- Compute `unpaid = members where !is_paid` for that cycle.
- Find chama manager(s): `chama_members where is_manager and status='active'`.
- If `unpaid.length === 0`: SMS each manager — "All {n} members paid for cycle {cycle_number} of {chama.name}. Total pool KES {pool}."
- Else: SMS each manager — "Cycle {cycle_number} of {chama.name}: {unpaid.length} member(s) missed: {names list, max 5 then '+x more'}. Paid: {paid_count}/{n}."

Always also push + in-app notify (free). SMS uses `send-transactional-sms`. Sanitize per SMS policy (no emojis, no Pamojanova: prefix). Keep < 160 chars; if list exceeds, truncate with "+N more".

## 5. Notification policy memory update

Append a section to `mem/architecture/payment-notification-policy.md` covering the new cycle-summary SMS to managers (and only managers).

## Technical files touched

- migration: enum value + columns on `chama_members`
- `supabase/functions/daily-payout-cron/index.ts` — replace removal with freeze; add cycle-end manager SMS
- `supabase/functions/c2b-confirm-payment/index.ts`, `payment-stk-callback/index.ts` — overpayment cap audit; unfreeze on settlement
- `src/pages/ChamaDetail.tsx`, `src/components/MemberDashboard.tsx` — Today's Pool tile, frozen banner
- new: `src/components/chama/CurrentCyclePool.tsx`, `src/components/chama/FrozenMemberBanner.tsx`
- `mem/architecture/payment-notification-policy.md` — manager summary SMS rule
- new memory: `mem/chama/member-freeze-policy.md` (replaces auto-removal rule conceptually)

## Out of scope

- Backfilling already-removed members to frozen (one-way going forward unless you want a backfill — say so).
- Changing existing weekly/monthly removal behavior beyond renaming to freeze (applies uniformly to all frequencies — confirm if you want freeze ONLY for daily).
