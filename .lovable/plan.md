## The bug

When a user withdraws KES 930 from a campaign, Safaricom B2C charges a 15 KES fee, so the recipient receives 915. The current code deducts **what the recipient received (915)** from the entity's `available_balance` instead of **what was approved to leave (930)**.

That leaves the 15 KES B2C fee permanently stuck in the balance. Your campaign shows KES 44.76 instead of the correct ~29.76.

### Root cause

**`process_withdrawal_completion()` SQL function** (used by `b2c-callback`):
```sql
v_effective_amount := COALESCE(NULLIF(p_transaction_amount, 0), v_withdrawal.net_amount, v_withdrawal.amount);
-- p_transaction_amount = M-Pesa "TransactionAmount" = 915 (recipient amount)
-- net_amount column = amount - transaction_fee = 915
-- Then: available_balance := available_balance - 915  ← WRONG, should be 930
```

**`withdrawals-crud` manual completion path** (`isManualCompletion` block, lines 1388–1424): same mistake — uses `Number(existingWithdrawal.net_amount)` instead of `amount`.

### Why other entities are affected

Same `process_withdrawal_completion()` runs for chama, mchango, and organization withdrawals. **Welfare is unaffected** — it deducts `withdrawal.amount` (the gross) at the cooling-off approval step, before B2C runs.

The `withdrawals.amount` column is the source of truth for what should leave the entity (gross outflow including the Safaricom fee). `net_amount` represents only what the recipient receives.

## The fix

### 1. Patch `process_withdrawal_completion` (DB migration)
Change effective amount to always use `v_withdrawal.amount`. Drop the `p_transaction_amount` / `net_amount` fallbacks for the deduction. Keep `p_mpesa_receipt` / `p_transaction_amount` parameters (still needed for the receipt-dedup check and for callers), just don't use them to compute the deduction.

```sql
v_effective_amount := v_withdrawal.amount;
```

This fixes mchango, chama, and organization paths in one place.

### 2. Patch `withdrawals-crud` manual completion (edge function)
Replace the four `Number(existingWithdrawal.net_amount)` references in the `isManualCompletion` branch with `Number(existingWithdrawal.amount)` so admin-side "mark as paid" matches the same rule.

### 3. Backfill the stuck balance (data fix)
Audit found exactly one stuck row site-wide:
- "Full gospel church refunish campaign" — KES 15 stuck.

Apply: `mchango.available_balance -= 15` and `mchango.current_amount -= 15` for that campaign so it drops from KES 44.76 to KES 29.76.

(Run a query before applying to confirm no new stuck rows appeared since.)

### 4. Verification
- Deploy edge function + migration.
- Re-query `mchango` for the user's campaign — balance should be 29.76.
- Confirm no other entity ended up negative.

## Out of scope
- No changes to commission math (deductive 7% on contributions stays untouched).
- No changes to welfare flow (already correct).
- No UI changes — `available_balance` is what the dashboard reads; once the value is right, every page is right.
- The `withdrawals.net_amount` column stays as-is (it's accurate as "what the recipient received").