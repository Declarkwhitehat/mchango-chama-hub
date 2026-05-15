## The bug

When a member overpays a chama cycle, `contributions-crud` correctly:
- Deducts the 5% commission on the overpayment
- Stores the net credit in `chama_overpayment_wallet` (status `pending`)
- **Intentionally does NOT** write to `chama_members.carry_forward_credit` / `next_cycle_credit` (to avoid double-crediting — there's an explicit comment about this being the "single source of truth")

But when the next cycle is created, both `cycle-auto-create` and `daily-cycle-manager` read the credit from the **wrong place**:

```ts
const totalCredit = (member.carry_forward_credit || 0) + (member.next_cycle_credit || 0);
```

Those columns are always 0, so `creditToUse` is 0, the new cycle's payment record is created with the full amount due, and the wallet entry stays `pending` forever.

## The fix

In both `cycle-auto-create` and `daily-cycle-manager`, read each member's available credit from `chama_overpayment_wallet` (sum of `pending` entries) instead of the member columns.

### Steps

1. **`supabase/functions/cycle-auto-create/index.ts`**
   - Before building `paymentRecords`, fetch all `chama_overpayment_wallet` rows for this chama with `status='pending'`, grouped by `member_id`, ordered by `created_at` (FIFO).
   - Replace `totalCredit = carry_forward_credit + next_cycle_credit` with `totalCredit = sum(pending wallet entries for this member)`.
   - Keep the existing logic that compares against `netCycleCost`, builds `payment_allocations`, and marks wallet entries `applied` / partially consumed.
   - Remove the now-dead `chama_members.update({ carry_forward_credit, next_cycle_credit: 0 })` write (those columns aren't being maintained anymore).

2. **`supabase/functions/daily-cycle-manager/index.ts`**
   - Same change: source credit from `chama_overpayment_wallet` instead of member columns; remove the stale member-column write.

3. **Backfill the user's stuck cycle**
   - Find the affected chama's currently-active cycle.
   - For each member with a `pending` wallet entry, apply it to their `member_cycle_payments` row for that cycle (mirror the same logic the new code will run on cycle creation), bump `chama.available_balance`, and mark the wallet entries `applied`.
   - Run as a one-off SQL via the insert/migration tool after the user confirms which chama.

4. **Verification**
   - Deploy the two edge functions.
   - Confirm via `chama_overpayment_wallet` that the user's pending entry flips to `applied` and the new cycle's `member_cycle_payments` row shows `is_paid=true` (or reduced `amount_remaining`).

### Out of scope
- No schema changes. No UI changes. The `OverpaymentWallet` component already reads from the right table.
- Not touching `contributions-crud` — its overpayment logic is correct.

### Question before I implement
Do you want me to also backfill your existing stuck chama (step 3) in the same change, or just fix the code so it works for the next cycle going forward?