

## Plan: Rename All Edge Functions Containing "mpesa"

This is a significant renaming effort across 9 edge functions and all files that reference them.

### Rename Mapping

| Current Name | New Name |
|---|---|
| `mpesa-c2b-validation` | `c2b-validate-payment` |
| `mpesa-c2b-callback` | `c2b-confirm-payment` |
| `mpesa-stk-push` | `payment-stk-push` |
| `mpesa-stk-query` | `payment-stk-query` |
| `mpesa-callback` | `payment-stk-callback` |
| `mpesa-b2c-payout` | `b2c-payout` |
| `mpesa-b2c-callback` | `b2c-callback` |
| `mpesa-register-c2b-urls` | `register-c2b-urls` |
| `admin-mpesa-search` | `admin-payment-search` |

### Changes Required

#### 1. Create new edge function directories (9 new folders)
Each new function will contain the same code as the old one, copied into the new directory name. The old directories will be deleted.

- `supabase/functions/c2b-validate-payment/index.ts` (from `mpesa-c2b-validation`)
- `supabase/functions/c2b-confirm-payment/index.ts` (from `mpesa-c2b-callback`)
- `supabase/functions/payment-stk-push/index.ts` (from `mpesa-stk-push`)
- `supabase/functions/payment-stk-query/index.ts` (from `mpesa-stk-query`)
- `supabase/functions/payment-stk-callback/index.ts` (from `mpesa-callback`)
- `supabase/functions/b2c-payout/index.ts` (from `mpesa-b2c-payout`)
- `supabase/functions/b2c-callback/index.ts` (from `mpesa-b2c-callback`)
- `supabase/functions/register-c2b-urls/index.ts` (from `mpesa-register-c2b-urls`)
- `supabase/functions/admin-payment-search/index.ts` (from `admin-mpesa-search`)

#### 2. Update internal cross-references within edge functions
These edge functions call each other by URL and need updated references:

- **`payment-stk-push/index.ts`** (was `mpesa-stk-push`): Update callback URL from `mpesa-callback` → `payment-stk-callback`
- **`b2c-payout/index.ts`** (was `mpesa-b2c-payout`): Update QueueTimeOutURL and ResultURL from `mpesa-b2c-callback` → `b2c-callback`
- **`c2b-confirm-payment/index.ts`** (was `mpesa-c2b-callback`): Update B2C payout call from `mpesa-b2c-payout` → `b2c-payout`
- **`register-c2b-urls/index.ts`** (was `mpesa-register-c2b-urls`): Update URLs from `mpesa-c2b-validation` → `c2b-validate-payment` and `mpesa-c2b-callback` → `c2b-confirm-payment`
- **`supabase/functions/contributions-crud/index.ts`**: Update `mpesa-b2c-payout` → `b2c-payout`
- **`supabase/functions/daily-payout-cron/index.ts`**: Update `mpesa-b2c-payout` → `b2c-payout`
- **`supabase/functions/withdrawals-crud/index.ts`**: Update 3 references from `mpesa-b2c-payout` → `b2c-payout`

#### 3. Update frontend references (4 files)
- **`src/components/ChamaPaymentForm.tsx`**: `mpesa-stk-push` → `payment-stk-push`
- **`src/components/DonationForm.tsx`**: `mpesa-stk-push` → `payment-stk-push`, `mpesa-stk-query` → `payment-stk-query`
- **`src/components/OrganizationDonationForm.tsx`**: `mpesa-stk-push` → `payment-stk-push`, `mpesa-stk-query` → `payment-stk-query`
- **`src/pages/AdminMpesaSearch.tsx`**: `admin-mpesa-search` → `admin-payment-search`
- **`src/pages/AdminPaymentConfig.tsx`**: Update C2B URL references from `mpesa-c2b-validation` → `c2b-validate-payment` and `mpesa-c2b-callback` → `c2b-confirm-payment`

#### 4. Delete old edge function directories (9 deletions)
Remove the old named directories after creating the new ones.

#### 5. Update documentation
- **`OFFLINE_PAYMENT_SETUP.md`**: Update all URL references and function names

### Technical Details

- The `supabase/config.toml` is auto-managed and cannot be edited directly. The new function entries will be auto-detected when the new directories are created.
- Old function directories must be deleted to avoid duplicate deployments.
- The actual function logic remains identical; only directory names and cross-reference strings change.
- After deployment, you will need to **re-register the new C2B URLs with Safaricom** since the validation and confirmation URLs will change.

### Important Post-Deployment Step
After these changes deploy, you **must** re-register the C2B URLs with Safaricom's Daraja API using the new URLs:
- Validation: `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/c2b-validate-payment`
- Confirmation: `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/c2b-confirm-payment`

