

## Plan: Bulletproof All Financial Calculations

After auditing every financial display component, I found **4 distinct bugs** where numbers can mismatch or show incorrect values.

---

### Bug 1: CommissionDisplay calculates commission instead of using actual DB value

**Problem**: `CommissionDisplay` computes `commissionAmount = totalCollected * commissionRate`, but the actual commission paid (stored in DB as `total_commission_paid`) may differ due to rounding across many small transactions. This means the breakdown shows: `Total - Calculated Commission - Withdrawn = ???` which won't equal the actual `availableBalance` from the DB.

**Fix**: Add an optional `actualCommission` prop. When provided, use it instead of recalculating. Derive `totalWithdrawn` from the arithmetic: `totalCollected - actualCommission - availableBalance`.

**File**: `src/components/CommissionDisplay.tsx`
- Add `actualCommission?: number` prop
- Use `actualCommission ?? (totalCollected * commissionRate)` for commission display
- Auto-derive `totalWithdrawn` when not explicitly provided: `totalCollected - commission - availableBalance`
- This guarantees the breakdown always adds up: Total - Commission - Withdrawn = Available Balance

---

### Bug 2: MchangoDetail passes `current_amount` to WithdrawalButton instead of `available_balance`

**Problem** (line 316): `totalAvailable={campaign.current_amount}` but `available_balance` is the correct field. They could diverge.

**Fix**: `totalAvailable={Number(campaign.available_balance || campaign.current_amount || 0)}`

**File**: `src/pages/MchangoDetail.tsx` (line 316)

---

### Bug 3: MemberDashboard passes member-level contributions with chama-wide balances

**Problem**: `totalContributions` sums the individual member's payment history, but `available_balance` and `total_withdrawn` are chama-wide values. The commission breakdown shows member contributions minus chama-wide commission, which is nonsensical.

**Fix**: For chama members, CommissionDisplay should only show their own contribution info. Remove `availableBalance` and `totalWithdrawn` props since individual members don't have withdrawal access — those are chama-level concepts shown elsewhere (ChamaDetail for managers).

**File**: `src/components/MemberDashboard.tsx` (lines 358-365)
- Remove `availableBalance` and `totalWithdrawn` props from the CommissionDisplay call
- The component will fall back to calculated values (member's contributions × rate = net), which is correct for an individual member's view

---

### Bug 4: CommissionDisplay shows "Available for payout" for non-creator views

**Problem**: The label says "Available for payout" even when shown to regular members who can't withdraw. For chama members viewing their own contribution commission breakdown, this is misleading.

**Fix**: When `availableBalance` is not provided (member view), label it "Net After Commission" instead of "Available for payout".

**File**: `src/components/CommissionDisplay.tsx`

---

### Summary of Changes

| File | Change |
|------|--------|
| `CommissionDisplay.tsx` | Add `actualCommission` prop; auto-derive withdrawn so breakdown always sums correctly; fix label for member vs creator view |
| `MchangoDetail.tsx` | Line 316: use `available_balance` for WithdrawalButton; pass `actualCommission` from DB |
| `OrganizationDetail.tsx` | Pass `actualCommission` from DB |
| `MemberDashboard.tsx` | Remove chama-wide balance props from CommissionDisplay |

These changes ensure that every financial display derives its numbers from actual DB values and that the breakdown arithmetic is always consistent (Total - Commission - Withdrawn = Available Balance).

