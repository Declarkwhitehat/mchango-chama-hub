## Phase 3 — End-of-Chama Wallet Sweep + Cycle Start Timestamp + SMS Polish

When a chama transitions to `cycle_complete` (every member has been paid out), drain each member's `chama_overpayment_wallet` balance per v2 spec, then tidy two related touch-ups.

### Sub-feature A — Wallet sweep on chama completion

**Trigger point**: `cycle-auto-create/index.ts` line ~204–214 already detects "all members had their turn" and flips chama to `cycle_complete`. Hook the sweep into that branch BEFORE the response, calling a new edge function `chama-wallet-sweep` (POST `{ chamaId }`).

**Per-member rule** (v2 §end-of-chama):

```text
balance = SUM(amount) WHERE status='pending' AND member_id=M
if balance > 10:
    floor_kes = Math.floor(balance)                  // shed sub-shilling
    sub_shilling = balance - floor_kes               // → company
    fee = getMpesaTransactionFee(floor_kes)
    net_to_member = floor_kes - fee.transactionFee
    if net_to_member > 0 and member has mpesa default:
        INSERT withdrawals (
          chama_id, requested_by=member.user_id,
          amount=floor_kes, commission_amount=0, net_amount=net_to_member,
          transaction_fee=fee.transactionFee, safaricom_cost=fee.safaricomCost,
          company_revenue=fee.companyRevenue,
          status='approved', reviewed_at=now,
          metadata={ kind:'chama_wallet_sweep', chama_id, member_id,
                     sub_shilling_remainder, source_wallet_ids:[...] }
        )
        call b2c-payout
        company_earnings += fee.companyRevenue + sub_shilling
    else:
        company_earnings += balance   // no payment method → forfeit
else:
    company_earnings += balance       // ≤ KES 10 → 100% to company

UPDATE chama_overpayment_wallet SET status='swept', applied_at=now()
  WHERE id IN (...source rows)
```

**Dual SMS** at sweep time (NOT via b2c-callback this time — sweep SMS goes immediately on initiation per v2; B2C delivery success uses the existing completion SMS path):
- To member with payout: `Pamojanova: Your final wallet balance of KES {net} from "{chama}" has been sent. Mpesa Ref will follow.`
- To member with no payout (forfeit or ≤10): `Pamojanova: "{chama}" has ended. Your remaining wallet balance of KES {balance} was below the KES 10 payout threshold and absorbed by the platform.`

### Sub-feature B — `cycle.start_date` = 12:01 AM EAT of target day

`cycle-auto-create` currently uses `new Date()` (UTC now) at trigger moment. Replace with helper `getEatMidnightOnePastForDate(date)` returning ISO string for 21:01 UTC of the prior calendar day (= 00:01 EAT). Apply at every `start_date` insert in:
- `cycle-auto-create/index.ts`
- `chama-start-new-cycle/index.ts`
- `chama-start/index.ts` (first cycle)

### Sub-feature C — `cycle_complete` SMS polish

Current `chama-cycle-complete/index.ts` template uses an emoji 🎉 (violates SMS Sanitization Policy). Rewrite to plain GSM-7:

```
Pamojanova: "{chama_name}" has completed its full cycle. All members have received their payouts. To rejoin a new cycle, contact your manager {managerName} ({managerPhone}) or open the app. Member ID: {member_code}.
```

Wrap via `sanitizeSmsMessage()` if helper exists in `_shared`; otherwise strip emoji inline.

### Technical artifacts

- **New file**: `supabase/functions/chama-wallet-sweep/index.ts` (verify_jwt = false, service-role only via shared-secret header `x-cron-secret` OR called with service-role bearer from `cycle-auto-create`).
- **New helper**: extend `supabase/functions/_shared/chamaDeadlines.ts` with `getEatMidnightOnePastForDate(date: Date): string`.
- **Edits**: `cycle-auto-create/index.ts` (invoke sweep + use helper for start_date), `chama-start-new-cycle/index.ts`, `chama-start/index.ts`, `chama-cycle-complete/index.ts`.
- **No new tables**. `metadata.kind = 'chama_wallet_sweep'` reuses Phase 2's column.
- **Idempotency**: sweep function early-exits if any `chama_overpayment_wallet` row for that chama already has `status='swept'`.

### Out of scope (deferred)
- Aggregating debt B2C across recipients (per Phase 2 decision).
- Reminder cron alignment (12:01 PM / 12:05 PM / 6:15 PM) — separate phase.
- Backfilling existing orphaned wallet balances on already-completed chamas (one-off script, not in this phase).

### Verification
1. Force Chacha test 2 to `cycle_complete` and confirm sweep runs once.
2. Member with KES 25.40 wallet → 1 B2C for KES 25, company gets fee + KES 0.40.
3. Member with KES 7 → no B2C, company gets KES 7, SMS sent.
4. Member with KES 0 → no row touched, no SMS.
5. Re-invoke sweep manually → no duplicate withdrawals (rows now `status='swept'`).
6. Confirm next cycle created post-Phase-1 (debt buffer drain) shows `start_date` at 00:01 EAT.
7. Confirm cycle-complete SMS arrives without garbled "dY%" emoji artifacts.
