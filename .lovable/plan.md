

# Automatic Chama Payout System with Deficit Handling — Audit & Improvement Plan

## Current State Assessment

After reviewing all three core functions (`daily-payout-cron`, `contributions-crud`, `daily-cycle-manager`) and the database schema, the system has most building blocks but has several critical gaps:

### What Already Works
- FIFO debt settlement engine in `contributions-crud` (penalties → principal → current cycle → carry-forward)
- Debt/deficit accrual in `daily-payout-cron` via `accrueDebtsForCycle()`
- Payout skip + reordering logic for ineligible members
- Auto-removal after 3 missed payments
- Cycle creation and auto-advance

### Critical Issues Found

1. **Deficit settlement never actually pays the recipient**: When `settleDebts()` clears a deficit (late payment comes in), it calculates `toRecipients` and marks the deficit as "paid" — but never creates a withdrawal or B2C payout to send money to the shortchanged member. The funds vanish into `toRecipients` with no disbursement.

2. **No duplicate payout guard**: `daily-payout-cron` doesn't check if a withdrawal already exists for a cycle before creating one. If the cron runs twice or overlaps with the immediate-payout trigger in `contributions-crud`, double payouts can occur.

3. **No row-level locking on cycle processing**: Multiple cron invocations can process the same cycle concurrently, causing double debt accrual and duplicate withdrawals.

4. **`daily-cycle-manager` auto-advance doesn't process payouts**: It marks expired cycles as complete but skips the actual payout processing and debt accrual that `daily-payout-cron` handles. This means if `daily-cycle-manager` runs (triggered by frontend), the cycle is marked complete without paying anyone.

5. **Payout calculated from payment records, not ledger**: The payout amount in `daily-payout-cron` is calculated ad-hoc from `member_cycle_payments` rather than from `available_balance` or the `financial_ledger`, risking inconsistencies.

6. **No payout ledger**: Withdrawals/payouts are tracked in the `withdrawals` table but there's no corresponding `financial_ledger` entry for payouts, breaking the ledger-based accounting model.

---

## Implementation Plan

### 1. Fix deficit settlement to actually disburse funds to shortchanged recipients

**File**: `supabase/functions/contributions-crud/index.ts`

When `settleDebts()` clears a principal debt linked to a deficit, it must:
- Create a withdrawal record for the deficit recipient (the member who received less)
- Trigger B2C payout to send the net amount to that member
- Record in `financial_ledger` as a `deficit_settlement` transaction
- Add audit log entry

```text
Flow:
  Late payment arrives → settleDebts()
    → Penalty paid → company_earnings
    → Principal cleared → calculate net_to_recipient
    → Create withdrawal for recipient_member_id  ← NEW
    → Trigger B2C payout to recipient            ← NEW
    → Record in financial_ledger                  ← NEW
    → Mark deficit as 'paid'
```

### 2. Add duplicate payout prevention

**File**: `supabase/functions/daily-payout-cron/index.ts`

Before creating a withdrawal for a cycle:
- Check if a withdrawal already exists for this `chama_id` + cycle (using notes or a new `cycle_id` column on withdrawals)
- Skip if already exists

**Database migration**: Add `cycle_id` column to `withdrawals` table for explicit cycle-withdrawal linking.

**File**: `supabase/functions/contributions-crud/index.ts` (immediate payout trigger)
- Same duplicate check before creating the immediate-payout withdrawal

### 3. Add row-level locking to prevent race conditions

**File**: `supabase/functions/daily-payout-cron/index.ts`

Before processing each cycle:
- Use `SELECT ... FOR UPDATE SKIP LOCKED` pattern via an RPC function to claim the cycle
- Only process if the lock is acquired
- This prevents two concurrent cron runs from processing the same cycle

**Database migration**: Create `claim_cycle_for_processing` RPC function.

### 4. Merge auto-advance into payout-cron (single processing path)

**File**: `supabase/functions/daily-cycle-manager/index.ts`

The `auto-advance` action currently marks cycles complete without processing payouts. Fix by:
- Removing the payout-skipping behavior from auto-advance
- Having auto-advance call `daily-payout-cron` for each expired cycle instead of handling it inline
- OR: consolidate by having auto-advance only create cycles, and letting the cron handle all expired cycle processing

This ensures every cycle completion goes through the same path: payout → debt accrual → next cycle creation.

### 5. Add payout entries to financial_ledger

**File**: `supabase/functions/daily-payout-cron/index.ts`

After creating a withdrawal, insert a `financial_ledger` record:
```typescript
await supabase.from('financial_ledger').insert({
  transaction_type: 'payout',
  source_type: 'chama',
  source_id: chama.id,
  gross_amount: collectedAmount,
  commission_amount: totalCommission,
  net_amount: payoutAmount,
  commission_rate: commissionRate,
  reference_id: newWithdrawal.id,
  description: `Cycle #${cycle.cycle_number} payout to ${actualBeneficiary.member_code}`
});
```

Also add `deficit_settlement` entries when deficit payments are disbursed.

### 6. Add comprehensive audit logging

**Files**: `contributions-crud/index.ts`, `daily-payout-cron/index.ts`

Add `audit_logs` entries for:
- Every payout (amount, recipient, cycle, type)
- Every skip (member, reason, new position)
- Every deficit creation and settlement
- Every debt accrual and clearance
- Every B2C transaction attempt and result

Most of these already exist partially; fill the gaps.

### 7. Database migrations needed

```sql
-- 1. Add cycle_id to withdrawals for duplicate prevention
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES contribution_cycles(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_cycle_unique 
  ON withdrawals(chama_id, cycle_id) WHERE status != 'rejected';

-- 2. Claim-cycle RPC for row-level locking
CREATE OR REPLACE FUNCTION claim_cycle_for_processing(p_cycle_id UUID)
RETURNS BOOLEAN AS $$
  UPDATE contribution_cycles 
  SET payout_processed = true, payout_processed_at = now()
  WHERE id = p_cycle_id AND payout_processed = false
  RETURNING true;
$$ LANGUAGE sql;
```

---

## Files to Edit

| File | Changes |
|---|---|
| `supabase/functions/contributions-crud/index.ts` | Add deficit disbursement (withdrawal + B2C) when `settleDebts()` clears a deficit; add duplicate payout check in immediate-payout trigger |
| `supabase/functions/daily-payout-cron/index.ts` | Add duplicate payout guard via `cycle_id`; add `financial_ledger` payout entries; use `claim_cycle_for_processing` lock; add audit logs |
| `supabase/functions/daily-cycle-manager/index.ts` | Remove inline payout logic from auto-advance; delegate to `daily-payout-cron` or just handle cycle creation |
| Database migration | Add `cycle_id` to `withdrawals`; create unique index; create `claim_cycle_for_processing` RPC |

