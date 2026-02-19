
# Chama Engine: Universal Production Specification Implementation

## Analysis: What Exists vs. What the Spec Requires

The existing system is a good foundation but has several critical gaps when measured against the full specification. Here is the honest gap analysis:

### What Already Works
- 10:00 PM deadline for daily cycles (end_date set to 22:00:00)
- FIFO allocation (oldest unpaid cycles cleared first via `allocatePayment()`)
- Tiered commissions: 5% on-time, 10% late
- Per-member, per-cycle `member_cycle_payments` records
- Commission ledgering to `company_earnings` and `financial_ledger`
- Strict per-member obligation (no cross-subsidization in payout cron)
- Financial summary UI (Total Expected, Collected, Penalties, Unpaid Members)
- Auto-payout after deadline and when all pay early
- 3-strike auto-removal for missed payments

### Critical Gaps to Close

**Gap 1 — Debt/Deficit System Missing**
The spec defines a formal **Debt Record** (principal_debt + penalty_debt) and **Deficit Record** (linking underpaid recipients to non-payers). Currently, the system tracks `missed_payments_count` and `balance_deficit` on the member, but there are no structured debt records with itemized penalty vs. principal separation, and no formal deficit records linking a recipient to the payer who caused the shortfall.

**Gap 2 — Penalty Accrual at Cycle End (Not at Payment Time)**
The spec says: "Accrue Penalty Immediately" at the END of each cycle for non-payers. The current system only applies the 10% commission when a late payment is received. The penalty should be accrued as a separate debt record the moment the cycle closes, giving the member immediate visibility of what they owe BEFORE they pay.

**Gap 3 — Payment Allocation UI Breakdown Missing**
The spec requires: "Before confirming a payment, the user must be shown exactly how the funds will be allocated (e.g., 'Your 420 Ksh payment will be used to: Clear 20 Ksh penalty, Clear 200 Ksh past due principal, Pay 200 Ksh for current cycle')." The `AmountToPayCard` shows total but not an itemized per-debt allocation preview.

**Gap 4 — Idempotency Key on Payment Endpoint**
The spec requires idempotency on POST /payments to prevent double-processing. The current `contributions-crud` POST does not validate an `idempotency_key`.

**Gap 5 — Self-Inflicted Deficit Edge Case**
If the cycle recipient is also the only member who fails to pay, no deficit record should be created. This edge case is not explicitly handled in the current cron logic.

**Gap 6 — Deficit Visibility UI**
Underpaid recipients need to see which members caused their deficit and whether those late payments have cleared the deficit. There is no UI for this currently.

**Gap 7 — Downloadable Transaction Receipt**
Every transaction must generate a detailed, downloadable receipt with full allocation audit trail. The existing `ContributionsPDFDownload` exists but is a summary, not a per-transaction allocation receipt.

**Gap 8 — Partial Debt Tracking**
If a payment partially covers a debt (penalty + principal), the system must track the remaining partial debt. The current system tracks partial payments via `amount_remaining` in `member_cycle_payments`, but does not explicitly split into `penalty_remaining` vs. `principal_remaining`.

---

## Implementation Plan

### Phase 1 — Database: New Tables for Debt/Deficit System

**New table: `chama_member_debts`**
Stores formal debt records created at cycle end for each non-payer.

```sql
CREATE TABLE chama_member_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chama(id),
  member_id UUID NOT NULL REFERENCES chama_members(id),
  cycle_id UUID NOT NULL REFERENCES contribution_cycles(id),
  principal_debt NUMERIC NOT NULL,       -- the expected_contribution amount
  penalty_debt NUMERIC NOT NULL,         -- expected_contribution × late_penalty_rate
  principal_remaining NUMERIC NOT NULL,  -- reduces as payments clear it
  penalty_remaining NUMERIC NOT NULL,    -- reduces first (FIFO within debt)
  status TEXT NOT NULL DEFAULT 'outstanding', -- outstanding | partial | cleared
  created_at TIMESTAMPTZ DEFAULT now(),
  cleared_at TIMESTAMPTZ,
  payment_allocations JSONB DEFAULT '[]'
);
```

**New table: `chama_cycle_deficits`**
Links an underpaid cycle recipient to the non-paying member, tracking whether the deficit has been compensated.

```sql
CREATE TABLE chama_cycle_deficits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chama(id),
  cycle_id UUID NOT NULL REFERENCES contribution_cycles(id),
  recipient_member_id UUID NOT NULL REFERENCES chama_members(id),
  non_payer_member_id UUID NOT NULL REFERENCES chama_members(id),
  debt_id UUID NOT NULL REFERENCES chama_member_debts(id),
  principal_amount NUMERIC NOT NULL,   -- what the non-payer owed
  net_owed_to_recipient NUMERIC NOT NULL, -- principal × (1 - commission_rate)
  status TEXT NOT NULL DEFAULT 'outstanding', -- outstanding | paid
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**New column on `contributions`:**
Add `idempotency_key TEXT UNIQUE` to prevent double-processing.

**RLS Policies:**
- `chama_member_debts`: Members can view their own debts; managers can view all in their chama; admins have full access.
- `chama_cycle_deficits`: Involved members (recipient and non-payer) can view; managers can view; admins have full access.

---

### Phase 2 — Backend: `daily-payout-cron` — Create Debt & Deficit Records at Cycle Close

After disbursing the payout at cycle end, for each unpaid member:

1. **Calculate amounts:**
   - `principal_debt = expected_contribution` (the full amount owed)
   - `penalty_debt = expected_contribution × 0.10` (10% penalty)

2. **Self-inflicted deficit check:** If `non_payer_member_id === cycle.beneficiary_member_id` AND this is the ONLY non-payer, skip creating a deficit record (the recipient short-changed themselves).

3. **Insert `chama_member_debts` record** with full `principal_debt` and `penalty_debt`.

4. **Insert `chama_cycle_deficits` record** linking the underpaid recipient to this debt (unless self-inflicted).

5. **Update `member_cycle_payments`** to reflect the debt accrual with `payment_allocations` showing `penalty_accrued`.

This replaces the current `missed_payments_count` increment as the primary tracking mechanism (though `missed_payments_count` remains as a strike counter for auto-removal).

---

### Phase 3 — Backend: `contributions-crud` — FIFO Debt Settlement (Penalty First)

Replace the current `allocatePayment()` function with a new `settleDebts()` function that follows the exact spec order:

```
For each debt (oldest first):
  1. Pay penalty_remaining → company_revenue_account
  2. Pay principal_remaining:
     a. commission = principal × normal_commission_rate
     b. record commission → company_revenue_account  
     c. net = principal - commission
     d. send net → recipient of the corresponding deficit record
     e. mark deficit as PAID
After all debts cleared:
  3. Remaining amount → current cycle contribution
     a. commission = amount × normal_commission_rate
     b. record commission
     c. net → current cycle collection pot
  4. Any overage → member's carry_forward_credit (with commission already deducted)
```

**Idempotency:** At the top of the POST handler, check for `body.idempotency_key`. If provided, check the `contributions` table for an existing record with the same key. If found, return the existing response without re-processing.

---

### Phase 4 — Backend: Pre-Payment Allocation Preview Endpoint

Add a new action `preview-allocation` to `contributions-crud` (or a new `payment-preview` edge function). This takes:
- `member_id`
- `chama_id`  
- `gross_amount`

And returns a detailed breakdown of exactly how the payment will be allocated, without writing any data. This powers the "before confirming payment" UI.

Response shape:
```json
{
  "allocations": [
    { "type": "penalty_clearance", "debt_cycle": 1, "amount": 20, "destination": "company" },
    { "type": "principal_clearance", "debt_cycle": 1, "amount": 190, "destination": "Alice (recipient deficit)" },
    { "type": "commission_on_principal", "debt_cycle": 1, "amount": 10, "destination": "company" },
    { "type": "current_cycle", "amount": 190, "destination": "cycle_pot" },
    { "type": "commission_on_current", "amount": 10, "destination": "company" }
  ],
  "total_gross": 420,
  "total_to_company": 40,
  "total_to_recipients": 190,
  "total_to_cycle_pot": 190,
  "carry_forward": 0
}
```

---

### Phase 5 — Frontend: `AmountToPayCard` — Itemized Debt Breakdown

Update `AmountToPayCard` to fetch and display the formal debt records from `chama_member_debts`:

**Current display:**
```
Total Payable: KES 420
```

**New display:**
```
Your Outstanding Balance:
  ├── Penalty (Cycle #1):     KES  20  → Platform fee
  ├── Principal (Cycle #1):   KES 200  → Alice (owed to her)
  └── Current Cycle (on-time): KES 200  → Cycle pot
  ─────────────────────────────────────
  Total you pay:              KES 420
  Commissions deducted:       KES  20  (5% × KES 200 + 5% × KES 200)
  Net to beneficiaries:       KES 380
```

This is the "before confirming payment" transparency the spec requires.

---

### Phase 6 — Frontend: Deficit Visibility for Underpaid Recipients

Add a new `DeficitStatus` component to the chama detail page. For members who were the cycle recipient and received a partial payout, show:

```
┌─────────────────────────────────────────────┐
│  Your Cycle #1 Deficit                     │
│  You were owed: KES 190 from 1 non-payer   │
│                                             │
│  ┌────────────────────────────────────────┐ │
│  │ Eva (M002)        ● Outstanding       │ │
│  │ Principal owed: KES 200               │ │
│  │ Penalty accrued: KES 20              │ │
│  │ Status: Eva has not yet paid back     │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

This reads from `chama_cycle_deficits` where `recipient_member_id = current_user_member_id`.

---

### Phase 7 — Frontend: Per-Transaction Downloadable Receipt

Add a `TransactionReceiptDownload` component (using jsPDF, already installed). The receipt is generated client-side from the `payment_allocations` JSONB field stored in `contributions` / `member_cycle_payments`. It includes:

- Transaction ID and timestamp
- Member code and chama name
- Gross amount paid
- Itemized allocation table:
  - Penalty cleared (which debt cycle)
  - Principal cleared + commission + net to recipient
  - Current cycle contribution + commission
  - Carry-forward credited
- Ledger entry references (company_earnings record IDs)
- Downloadable as PDF

---

## Files to be Changed / Created

| File | Change |
|---|---|
| `supabase/migrations/[new].sql` | Create `chama_member_debts`, `chama_cycle_deficits` tables + RLS |
| `supabase/migrations/[new].sql` | Add `idempotency_key` column to `contributions` table |
| `supabase/functions/daily-payout-cron/index.ts` | Add debt + deficit record creation at cycle close; self-inflicted check |
| `supabase/functions/contributions-crud/index.ts` | Replace `allocatePayment()` with `settleDebts()` (FIFO: penalty → principal → current → carryforward); add idempotency check; add `preview-allocation` action |
| `src/components/chama/AmountToPayCard.tsx` | Fetch member debts from DB; show itemized per-debt breakdown before payment |
| `src/components/chama/DailyPaymentStatus.tsx` | Add `DeficitStatus` sub-section for underpaid recipients |
| `src/components/chama/DeficitStatus.tsx` | New component — shows which members owe this member and current status |
| `src/components/chama/PaymentAllocationPreview.tsx` | New component — shows "Your KES X will be allocated as follows" modal before payment confirmation |
| `src/components/TransactionReceiptDownload.tsx` | New component — generates per-transaction PDF receipt with full audit trail |
| `src/components/ChamaPaymentForm.tsx` | Integrate `PaymentAllocationPreview` before payment confirmation; pass idempotency key |

---

## Database Migration Summary

### Migration 1 — Debt & Deficit Tables

```sql
-- Formal debt record per non-paying member per cycle
CREATE TABLE public.chama_member_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL,
  member_id UUID NOT NULL,
  cycle_id UUID NOT NULL,
  principal_debt NUMERIC(15,2) NOT NULL,
  penalty_debt NUMERIC(15,2) NOT NULL,
  principal_remaining NUMERIC(15,2) NOT NULL,
  penalty_remaining NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'outstanding',
  created_at TIMESTAMPTZ DEFAULT now(),
  cleared_at TIMESTAMPTZ,
  payment_allocations JSONB DEFAULT '[]'::jsonb
);

-- Deficit record linking underpaid recipient to non-payer
CREATE TABLE public.chama_cycle_deficits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL,
  cycle_id UUID NOT NULL,
  recipient_member_id UUID NOT NULL,
  non_payer_member_id UUID NOT NULL,
  debt_id UUID NOT NULL,
  principal_amount NUMERIC(15,2) NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  net_owed_to_recipient NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'outstanding',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Migration 2 — Idempotency on Contributions

```sql
ALTER TABLE public.contributions
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
```

---

## Key Design Decisions

1. **Penalty Accrued at Cycle Close, Not at Payment**: Following the spec exactly. The moment the 10 PM deadline passes, the cron creates debt records with the full penalty pre-calculated. Members see their total outstanding BEFORE they pay.

2. **FIFO Penalty-First within Each Debt**: Within each debt record, penalty is cleared before principal (spec §Phase II step 2a and 2b). Between debt records, oldest cycle is cleared first.

3. **Deficit Records Enable Transparency**: When Eva pays back her missed principal, the system can explicitly route the net (190 KES) directly to Alice's deficit record and mark it PAID — this is what enables the "deficit visibility" UI for Alice.

4. **Self-Inflicted Deficit Rule**: Handled in cron — if `non_payer === recipient` for the cycle AND no other non-payers exist, no deficit record is created. The cycle is settled with what was collected.

5. **Idempotency via DB Unique Constraint**: The `idempotency_key UNIQUE` constraint on the `contributions` table is the cleanest, most reliable approach — the DB itself prevents double-inserts even under race conditions.

6. **Concurrency via Row-Level Locks**: The `settleDebts()` function in `contributions-crud` will use `SELECT ... FOR UPDATE` via a DB transaction to lock affected `chama_member_debts` rows before updating them, preventing race conditions.

7. **Preview without Side Effects**: The `preview-allocation` action runs all the math but makes zero DB writes, enabling the pre-confirmation UI.

8. **Receipt from Stored Allocations**: Rather than re-deriving allocations at receipt time, the `payment_allocations` JSONB column already stores everything. The receipt component simply renders this stored data as a formatted PDF.
