

# Stress Test & Financial Audit — Chama Payout System

## Audit Summary

After reviewing all three core functions (`daily-payout-cron` ~1064 lines, `contributions-crud` ~1205 lines, `daily-cycle-manager` ~448 lines), the database schema, and RPC functions, here is the complete assessment.

---

## What Is Already Correctly Implemented

The system has strong foundations:

- **FIFO debt settlement** with penalty-first ordering
- **Duplicate payout prevention** via `cycle_id` unique index on `withdrawals` + `claim_cycle_for_processing` RPC lock
- **Deficit disbursement** — late payments trigger B2C payouts to shortchanged recipients with `financial_ledger` entries
- **Gap recovery** — auto-creates missing cycles if the cron didn't run
- **Payout skip + reorder** — ineligible members moved to end of queue
- **Auto-removal** after 3 missed payments
- **Carry-forward credit** — overpayments go to next cycle, not the pool
- **Audit logging** for payouts, skips, deficits, and debt accrual
- **Idempotency** on contributions via `idempotency_key`

---

## Critical Issues Found (Requires Code Changes)

### Issue 1: Payout amount uses `amount_paid` from `member_cycle_payments` — not `available_balance`

In `daily-payout-cron` (lines 628-637), the payout amount is calculated by summing `amount_paid` from fully-paid members' cycle payment records. However, carry-forward credits applied during cycle creation (in `daily-cycle-manager`) increase `amount_paid` without actual new money entering the pool — yet the pool's `available_balance` was separately incremented.

**Risk**: Double-counting. If a member's carry-forward credit of KES 100 is applied to their cycle payment AND added to `available_balance`, the payout sums from `member_cycle_payments` will include KES 100 that was already counted in the pool.

**Fix**: The payout amount should be derived from the chama's `available_balance` at payout time (which tracks actual inflows minus outflows), capped at `contribution_amount * paid_members - commission`. Or — more conservatively — subtract the carry-forward portion from the `amount_paid` sum.

### Issue 2: `daily-cycle-manager` auto-advance still has stale inline logic

The `auto-advance` action (lines 390-448) delegates to `daily-payout-cron` via HTTP fetch, which is correct. But if that fetch fails silently, expired cycles remain unprocessed with `payout_processed = false` still set (the claim wasn't made). The frontend then shows stale data.

**Fix**: Add error handling — if the delegation fetch fails, return the error to the caller rather than silently swallowing it.

### Issue 3: `settleDebts` deficit withdrawal doesn't set `cycle_id`

In `contributions-crud` (line 340-356), the deficit settlement withdrawal insert does NOT include `cycle_id`. This means the duplicate payout guard (`idx_withdrawals_cycle_unique`) won't catch duplicate deficit settlements for the same cycle.

**Fix**: Add `cycle_id` from the deficit record's `cycle_id` to the withdrawal insert.

### Issue 4: Commission double-counting in immediate payout path

In `contributions-crud` (lines 1068-1071), the immediate payout calculates:
```
grossAmount = contribution_amount * totalMembers
commissionAmount = grossAmount * commissionRate
```

But each member's contribution already had 5% commission deducted and added to `company_earnings` during `settleDebts()`. The payout then deducts commission again from the gross, meaning commission is charged twice — once during contribution processing and once during payout.

**Fix**: The immediate payout should use `available_balance` (which is already net of commission) as the payout amount, with commission = 0 since it was already collected per-contribution.

### Issue 5: `available_balance` not deducted at payout creation

When a withdrawal is created in `daily-payout-cron`, the chama's `available_balance` is NOT deducted. It's only deducted later by `process_withdrawal_completion` RPC (on B2C callback). However, between withdrawal creation and B2C completion, a second payout could theoretically be created using the same balance — despite the `cycle_id` unique guard preventing exact duplicates, deficit settlements could still drain the same funds.

**Fix**: This is architecturally correct (atomic completion model per memory). But the system should verify `available_balance >= net_amount` before creating any withdrawal, and log a warning if insufficient.

---

## Implementation Plan

### 1. Fix commission double-counting in immediate payout

**File**: `supabase/functions/contributions-crud/index.ts` (lines 1068-1071)

Change the immediate payout to use the chama's `available_balance` as the payout source rather than recalculating gross from scratch. Since contributions already had commission deducted when entering the pool, the payout should be:

```typescript
// Read actual available balance
const { data: chamaBalance } = await supabaseAdmin
  .from('chama')
  .select('available_balance')
  .eq('id', body.chama_id)
  .single();

const netPayoutAmount = chamaBalance?.available_balance || 0;
const commissionAmount = 0; // Already collected per-contribution
const grossAmount = netPayoutAmount; // Pool is already net
```

### 2. Fix deficit withdrawal missing `cycle_id`

**File**: `supabase/functions/contributions-crud/index.ts` (line 340-356)

Add the cycle_id from the debt's linked cycle to the deficit withdrawal insert to enable the unique index guard.

### 3. Fix payout-cron to use pool balance instead of summing payments

**File**: `supabase/functions/daily-payout-cron/index.ts` (lines 628-637)

Replace the ad-hoc summation of `amount_paid` with a read of `chama.available_balance`. This ensures the payout matches actual pooled funds. Add a balance sufficiency check before creating withdrawals.

### 4. Add balance verification before all withdrawal creation

**Files**: Both `daily-payout-cron/index.ts` and `contributions-crud/index.ts`

Before any withdrawal insert, check `available_balance >= net_amount`. If insufficient, log an audit warning and either skip or create a partial payout.

### 5. Harden auto-advance error handling

**File**: `supabase/functions/daily-cycle-manager/index.ts`

Return errors from the delegation fetch rather than silently continuing.

---

## Scenarios Already Handled (No Changes Needed)

| Scenario | Status |
|---|---|
| Member pays KES 200 for KES 100 cycle | ✅ Overpayment goes to carry-forward, only KES 100 enters pool |
| Member misses payment, debt + deficit accrued | ✅ FIFO settlement creates debt record + deficit linking non-payer to recipient |
| Late payment clears deficit → B2C to recipient | ✅ Implemented with withdrawal + financial_ledger + audit_log |
| Ineligible beneficiary skipped | ✅ Moved to end of queue, next eligible member receives payout |
| No eligible members at all | ✅ `payout_type = 'none'`, funds stay in pool |
| Duplicate cron run | ✅ `claim_cycle_for_processing` RPC prevents double processing |
| Duplicate withdrawal for same cycle | ✅ Unique index `idx_withdrawals_cycle_unique` prevents it |
| M-Pesa callback delay | ✅ `process_withdrawal_completion` RPC handles atomic balance deduction on callback |
| 3 missed payments → auto-removal | ✅ With manager reassignment and SMS notifications |
| Gap recovery (cron missed days) | ✅ Creates missing cycles retroactively |

---

## Files to Edit

| File | Changes |
|---|---|
| `supabase/functions/contributions-crud/index.ts` | Fix commission double-counting in immediate payout; add `cycle_id` to deficit withdrawal |
| `supabase/functions/daily-payout-cron/index.ts` | Use `available_balance` for payout amount; add balance sufficiency check |
| `supabase/functions/daily-cycle-manager/index.ts` | Improve error handling in auto-advance delegation |

No database migrations needed — the schema already supports all required functionality.

