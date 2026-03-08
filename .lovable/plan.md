

## Change: Defer Commission on Overpayments to Cycle Application Time

### What Changes

**Current behavior**: Member pays KES 200 for a KES 100 cycle. The system takes 5% commission on the excess KES 100 immediately, storing KES 95 as credit.

**New behavior**: Member pays KES 200. First KES 100 gets 5% commission (KES 95 net to cycle pot). The extra KES 100 is stored as-is — no commission. When the next cycle arrives, that KES 100 is applied and *then* 5% commission is deducted (KES 95 net to pot).

### Why This Matters
Commission is only earned when money actually enters a cycle pot, not when it's parked as credit. This is fairer to members and aligns with the principle that commission = service fee on actual contributions.

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/contributions-crud/index.ts` | **Step 4 (lines 599-629)**: Store carry-forward at full amount (no commission deduction). Remove the `carry_forward_commission` allocation line. Update `previewAllocation` (lines 160-179) to match. |
| `supabase/functions/cycle-auto-create/index.ts` | **Lines 242-291**: When applying carry-forward credit to a new cycle, deduct 5% commission from the credit amount before marking as paid. Record the commission in `company_earnings`. Update `chama.total_commission_paid` and `available_balance` accordingly. |
| `supabase/functions/daily-cycle-manager/index.ts` | **Lines 139-192**: Same carry-forward application logic — deduct 5% commission when credit is consumed, not when stored. |
| `supabase/functions/simulate-chama-test/index.ts` | Update scenarios 2 and 3 to reflect: overpayment stores full KES 100 as credit, and credit application deducts 5% at usage time. |
| `src/utils/commissionCalculator.ts` | No changes needed — rates stay the same. |

### Detailed Logic

**At contribution time (contributions-crud, Step 4)**:
```
remaining = 100 (excess after cycle paid)
carry_forward_credit += 100   // store full amount, NO commission
```

**At next cycle creation (cycle-auto-create / daily-cycle-manager)**:
```
credit = 100
commission = 100 * 0.05 = 5   // commission taken NOW
net_to_pot = 95
amount_paid = 95
amount_remaining = max(0, contribution_amount - 95) = 5
carry_forward_credit = 0
```
Record KES 5 in `company_earnings` as `chama_commission` with description "Commission on carry-forward credit applied to Cycle #N".

### Edge Cases Handled
- Credit > contribution amount: e.g. KES 300 credit for KES 100 cycle → KES 100 used, 5% = KES 5 commission, KES 95 to pot, KES 200 remains as credit
- Credit < contribution amount: e.g. KES 50 credit for KES 100 cycle → KES 50 used, KES 2.50 commission, KES 47.50 to pot, member still owes KES 52.50

