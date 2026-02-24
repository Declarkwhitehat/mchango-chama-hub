

## Root Cause: Double-Counting Donations

The campaign "The BB ibechasers" shows KES 185 instead of the correct KES 85 because **two separate systems are both updating the balance** when a donation completes:

1. **Database trigger** (`update_mchango_on_donation`): Fires when donation status changes to `completed` and adds the **gross amount** (KES 100) to `current_amount`
2. **M-Pesa callback code** (`mpesa-callback/index.ts` line 324): Also adds the **net amount** (KES 85) to `current_amount`

Combined: 0 + 100 + 85 = **KES 185** (should be KES 85)

The trigger also uses the wrong amount — it adds `amount` (gross) instead of `net_amount`.

---

## Fix Plan

### 1. Fix the database trigger to use net amount only
Update `update_mchango_on_donation()` to add `net_amount` instead of `amount`:

```sql
IF NEW.payment_status = 'completed' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'completed') THEN
    UPDATE public.mchango
    SET current_amount = current_amount + COALESCE(NEW.net_amount, NEW.amount)
    WHERE id = NEW.mchango_id;
END IF;
```

### 2. Remove the duplicate update from mpesa-callback
Remove lines 321-329 in `mpesa-callback/index.ts` that update `current_amount`, `total_gross_collected`, `total_commission_paid`, and `available_balance` on the mchango table — since the trigger already handles `current_amount`. Or alternatively, keep only the callback code and drop the trigger.

**Recommended approach**: Keep the callback code (which tracks all 4 financial fields properly) and **remove the trigger**, since the callback already calculates gross/commission/net correctly and updates all financial columns.

### 3. Fix the current incorrect data
Run a data correction to set the campaign balance to the correct value based on actual completed donations:

```sql
UPDATE mchango SET
  current_amount = 85,
  available_balance = 85,
  total_gross_collected = 100,
  total_commission_paid = 15
WHERE id = 'a8723f41-5a12-468b-a87f-53d46cc81f82';
```

### 4. Fix all other affected campaigns
Check and correct any other campaigns with the same double-count issue.

---

## Technical Details

| Step | File/Object | Change |
|------|-------------|--------|
| Drop trigger | `update_mchango_on_donation` trigger | Remove entirely via migration |
| Keep callback logic | `supabase/functions/mpesa-callback/index.ts` | No change needed (already correct) |
| Data fix | Migration SQL | Correct "The BB ibechasers" balance from 185 to 85 |
| Audit other campaigns | Migration SQL | Recalculate all mchango balances from completed donations |

### Files to modify
- **New migration**: Drop the `on_donation_completed` trigger and fix data
- No edge function changes needed

