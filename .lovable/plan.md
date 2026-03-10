

## Plan: Fix Commission Model, Amount Display, and Date Format

### Three Issues to Fix

**Issue 1: Commission model is wrong (fundamental)**
Currently, commission is **deducted from** the member's payment. If a member pays KES 100, only KES 95 goes to the pool and KES 5 goes to the platform. The user wants commission to be **added on top**: KES 100 goes fully to the pool, and the platform charges KES 5 extra, so the member actually pays KES 105. For late payments: KES 100 to recipient + KES 10 penalty = KES 110 total.

**Issue 2: Shows KES 200 instead of KES 100**
In `DailyPaymentStatus.tsx` line 238, `totalPayable` is calculated as `totalOutstanding + cycleInfo.due_amount`, which double-counts when a member has 1 missed cycle (KES 100 outstanding + KES 100 current = KES 200). But the member only paid KES 100. The preview and timer should reflect what the member is actually paying, not the total owed.

**Issue 3: Dates should be dd/mm/yy format**
All dates across the platform currently use various formats (US locale, ISO, etc.). Need a centralized date formatter using `dd/MM/yy` format.

---

### Changes Required

#### 1. Commission Model Change (Additive, not Subtractive)

**`supabase/functions/contributions-crud/index.ts`** — Both `previewAllocation()` and `settleDebts()` functions:
- **Debt principal settlement**: Currently takes 5% commission FROM the principal (KES 100 → KES 5 commission + KES 95 to recipient). Change to: full KES 100 goes to recipient, commission is separately tracked. The gross payment from member = principal + penalty (commission is embedded in the penalty rate).
- **Current cycle**: Currently `net = toApply - commission`. Change to: the full contribution amount goes to the cycle pot. Commission is a separate charge on top. Member pays `contributionAmount * (1 + rate)`.
- **Preview math**: For KES 100 contribution with 5% on-time: show "KES 100 to pool, KES 5 commission, Total: KES 105". For late with 10%: "KES 100 to recipient, KES 10 penalty, Total: KES 110".

**`src/components/chama/AmountToPayCard.tsx`**:
- Fix line 47: `currentCycleGross = currentCycleDue ? contributionAmount / (1 - 0.05) : 0` → should be `contributionAmount * (1 + 0.05)` i.e. `contributionAmount * 1.05`
- Fix `totalPayable` calculation to use additive model

**`src/components/chama/PaymentAllocationPreview.tsx`** — UI will automatically reflect backend changes since it reads from the edge function preview.

**`src/utils/commissionCalculator.ts`**:
- Update `calculateAmountToPay()` to use additive model: `totalPayable = baseTotal + totalCommission` (commission ON TOP, not deducted)
- Update `calculateNetBalance` / `calculateTransactionNet` to reflect the new model

#### 2. Fix KES 200 Double Display

**`src/components/chama/DailyPaymentStatus.tsx`**:
- The `totalPayable` passed to `PaymentCountdownTimer` should not blindly add `totalOutstanding + cycleInfo.due_amount`. It should show what the member needs to pay NOW based on their actual debts and current cycle, respecting FIFO priority.

#### 3. Date Format (dd/mm/yy)

**`src/lib/utils.ts`** — Add a centralized date formatting helper:
```typescript
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}
```

Then update all ~26 files that use `toLocaleDateString()` to use this helper instead. Key files include:
- `src/pages/Home.tsx`, `src/pages/ChamaDetail.tsx`, `src/pages/ChamaList.tsx`
- `src/components/chama/PreStartDashboard.tsx`, `src/components/chama/DailyPaymentStatus.tsx`
- `src/components/admin/*.tsx` (multiple admin components)
- All other pages and components with date displays

### Summary of File Changes
- **Edge function**: `supabase/functions/contributions-crud/index.ts` (commission model fix)
- **Frontend components**: `AmountToPayCard.tsx`, `DailyPaymentStatus.tsx`, `PaymentAllocationPreview.tsx`
- **Utils**: `commissionCalculator.ts`, `src/lib/utils.ts`
- **Date format**: ~26 files across the codebase

