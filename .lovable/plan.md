## Goal

1. **Testing mode**: drop chama minimum contribution from KES 100 → KES 20 (revert later on request).
2. **Admin-configurable minimums**: add admin-controlled settings for:
   - Chama minimum contribution amount
   - Withdrawal minimum (one value per entity type: chama, mchango campaign, welfare)

All minimums become single-source-of-truth values stored in `platform_settings` and read by both the frontend and edge functions.

---

## New `platform_settings` keys

Insert four rows (idempotent) into the existing `platform_settings` table:

| setting_key | initial value | description |
|---|---|---|
| `min_chama_contribution` | `{"amount": 20}` | Minimum chama contribution amount (testing value; production = 100) |
| `min_withdrawal_chama` | `{"amount": 100}` | Minimum chama payout/withdrawal amount |
| `min_withdrawal_mchango` | `{"amount": 100}` | Minimum mchango campaign withdrawal amount |
| `min_withdrawal_welfare` | `{"amount": 100}` | Minimum welfare withdrawal amount |

A small shared helper `supabase/functions/_shared/getPlatformMinimums.ts` will read these (with safe fallbacks of 20 / 100 / 100 / 100) so every edge function uses the same source.

---

## Backend changes

### `supabase/functions/chama-crud/index.ts`
On chama create/update, fetch `min_chama_contribution` and reject if `contribution_amount < min` with a clear error showing the configured minimum.

### `supabase/functions/withdrawals-crud/index.ts`
The current Zod schema hardcodes `min(10, 'Minimum withdrawal is KES 10')`. Replace with a runtime check that loads the right minimum based on which entity ID is present (`chama_id` → chama, `mchango_id` → mchango, `organization_id` → mchango, welfare flow → welfare). Return a 400 with the configured minimum if violated.

### `supabase/functions/welfare-withdrawal-approve/index.ts` and `welfare-cooling-off-payout/index.ts`
Add the same minimum check using `min_withdrawal_welfare` so welfare withdrawals are also gated.

### `supabase/functions/payment-stk-push/index.ts`
Keep the existing `>= 1` floor (M-Pesa technical floor). Chama-specific floor is enforced upstream by the contribution form + chama-crud, so no change here.

---

## Frontend changes

### Shared hook: `src/hooks/usePlatformMinimums.ts` (new)
Reads the four `platform_settings` rows once via React Query (5-min cache), exposes `{ minChamaContribution, minWithdrawal: { chama, mchango, welfare } }` with the same safe fallbacks.

### `src/pages/ChamaCreate.tsx`
Replace the hardcoded `min="100"` on the contribution input with `min={minChamaContribution}`, and update the surrounding helper text + validation error to show the live value.

### `src/components/ChamaPaymentForm.tsx`
The "amount must be ≥ contribution_amount" check stays as-is (driven by the chama itself), so this works automatically once the chama is created with a 20 KES floor.

### Withdrawal forms (chama, mchango, welfare)
Wherever a withdrawal amount is entered, swap the hardcoded floor for the configured value and show "Minimum withdrawal: KES X" beneath the input.

### Admin settings page: `src/pages/AdminCommissionConfig.tsx`
Extend the existing commission-config page with a new "Minimums" card that lets admins edit:
- Chama minimum contribution
- Withdrawal minimums (chama / mchango / welfare)

Saves write to `platform_settings` (admin-only RLS already exists) and log to `audit_logs` like the existing commission settings do.

---

## Reverting after testing

When you say "go back to 100", I'll just update the `min_chama_contribution` row back to `{"amount": 100}` in `platform_settings` — no code changes needed. Or you can do it yourself from the new admin Minimums card.

---

## Files touched

**New**
- `supabase/functions/_shared/getPlatformMinimums.ts`
- `src/hooks/usePlatformMinimums.ts`
- One migration to insert the four `platform_settings` rows

**Edited**
- `supabase/functions/chama-crud/index.ts`
- `supabase/functions/withdrawals-crud/index.ts`
- `supabase/functions/welfare-withdrawal-approve/index.ts`
- `supabase/functions/welfare-cooling-off-payout/index.ts`
- `src/pages/ChamaCreate.tsx`
- `src/pages/AdminCommissionConfig.tsx`
- Withdrawal request UI (chama withdrawal, mchango withdrawal, welfare withdrawal forms)

No changes to commission logic, M-Pesa flow, or settlement engine.
