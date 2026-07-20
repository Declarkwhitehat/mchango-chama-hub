# Fix: offline (Paybill) payments never reach the app

## Confirmed root cause

Both offline payments succeeded on M-Pesa but **zero C2B callbacks ever landed in our system since the database was cleared** — I verified:

- Welfare `Kisumu ndogo` (code `NBGY`) and member `NBGYM0001` exist and are active — the KES 20 should have matched cleanly.
- Receipts `UGKF9BUKTY` and `UGKF9BULH2` are **not in `mpesa_receipt_registry`**, meaning `c2b-confirm-payment` was never invoked by Safaricom.
- STK Push callbacks work perfectly today (5 completed since morning) because STK passes the callback URL inline per request. C2B does not — it requires **pre-registration** with Safaricom.

Conclusion: The **C2B Validation/Confirmation URLs are not registered (or were dropped) for shortcode 4015351**, so every Paybill payment is accepted by Safaricom but the callback is never fired. Money is safe in the paybill float; the app just never hears about it.

## Fix

### 1. Re-register C2B URLs with Safaricom
Invoke the existing `register-c2b-urls` edge function (already correctly targets shortcode `4015351` with our two edge function URLs). If Safaricom rejects it, surface the actual error.

### 2. Add "Manage C2B URLs" panel to `/admin/payment-config`
Two buttons:
- **Register / Re-register C2B URLs** → calls `register-c2b-urls`, shows Safaricom's raw response.
- **Check current registration** → new mode in `register-c2b-urls` that hits Safaricom's `getURLsRegistration` (or attempts a re-register and returns the response) so you can verify the callback URL Safaricom currently holds.

### 3. Safety net: `unmatched_c2b_payments` table + admin page
Even with URLs registered, a mistyped account like `7NUCM0001` (yours — the welfare it referred to had been deleted) currently vanishes silently. Add:
- New table `unmatched_c2b_payments` (receipt UNIQUE, account, amount, payer phone/name, raw payload, status: `unmatched | allocated | refunded`, allocation metadata).
- Update `c2b-confirm-payment` to always log every callback here; mark `allocated` once matched, keep `unmatched` when no match.
- New admin page `/admin/unmatched-payments`: lists unmatched rows with an **Allocate** action (pick chama/welfare/mchango/organization + member) that writes the correct payment row and updates group balances, and a **Mark refunded** action with a required note.
- Dashboard badge when unmatched count > 0.

### 4. Manually recover your two payments
After C2B URLs are re-registered, backfill the two lost receipts:
- `UGKF9BULH2` KES 20 → insert directly into `welfare_contributions` for `Kisumu ndogo` / member `NBGYM0001` (matches cleanly), update welfare totals, write ledger + company_earnings.
- `UGKF9BUKTY` KES 50 → insert into `unmatched_c2b_payments` so you can allocate/refund from the new admin page (original welfare `7NUCM0001` was deleted).

### 5. Alert admins on unmatched payments
When `c2b-confirm-payment` records an `unmatched` row, also push in-app notification + SMS to super_admins so they can act within minutes.

## Files touched

Backend
- `supabase/migrations/*_unmatched_c2b_payments.sql` — new table + RLS + grants.
- `supabase/functions/c2b-confirm-payment/index.ts` — always log to registry; mark allocated on success; notify admins on unmatched.
- `supabase/functions/register-c2b-urls/index.ts` — accept `{ mode: 'query' }` to return current Safaricom-side URLs.
- New `supabase/functions/allocate-unmatched-payment/index.ts` — super_admin-only allocation endpoint that reuses matching logic.

Frontend
- `src/pages/AdminPaymentConfig.tsx` — new "C2B URL registration" panel.
- `src/pages/AdminUnmatchedPayments.tsx` — new admin page + route + nav link.
- `src/components/admin/UnmatchedPaymentsBadge.tsx` — dashboard widget.

Data
- Insert for `UGKF9BULH2` into welfare tables.
- Insert for `UGKF9BUKTY` into `unmatched_c2b_payments`.

## Out of scope
- Automatic Safaricom Reversal API for refunds (kept manual).
- Any changes to STK/callback commission logic.
