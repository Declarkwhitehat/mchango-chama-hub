## Goal
Add **account-level verification** (selfie + KES 1,500 paid via M-Pesa STK), make verified accounts' campaigns/groups appear first, auto-verify any entity created by a verified account, expose the new fee in Commission Config, and fix the **Mchango commission rate** being unchangeable from the admin panel.

## 1. Account Verification

### Database
- `profiles.is_verified boolean default false`, `profiles.verified_at timestamptz`.
- New table `user_verification_requests`:
  - `id, user_id, selfie_path, fee_amount, payment_status` (`pending|paid|failed`), `payment_reference, paid_at, status` (`pending|approved|rejected`), `rejection_reason, reviewed_by, reviewed_at, created_at`.
  - RLS: owner can SELECT/INSERT own; admins manage all.
- Storage bucket `verification-selfies` (private). RLS: user can upload own folder; admins read all.
- New `platform_settings` row `user_verification_fee` = 1500.
- Trigger on insert into `mchango`, `chama`, `welfares`, `organizations`: if creator's `profiles.is_verified = true` → set `is_verified = true` on the new row (no fee).

### Edge functions
- `request-account-verification`: validate input, upload-key check, create `user_verification_requests` row in `pending/payment_status=pending`, trigger STK push for KES 1,500 with `AccountReference = ACCV-<short>`.
- Extend `payment-stk-callback` to handle the `account_verification` purpose: on success, mark `user_verification_requests.payment_status='paid'`, log to `company_earnings` (`source='accountVerificationFee'`).
- `admin-account-verification`: approve (`profiles.is_verified=true, verified_at=now()`) or reject (auto-refund optional — initial scope: no refund, manual only).

### Frontend
- New page **`/account/verify`** (entry from Profile dropdown and a "Get Verified" CTA on profile/settings):
  - Step 1: capture/upload selfie (camera or file).
  - Step 2: confirm phone, show fee, trigger STK.
  - Step 3: poll status; show pending/approved/rejected badge.
- Profile screen shows blue "Verified Account" badge when `is_verified=true`.
- Mchango / Chama / Welfare / Organization list queries: change order to `created_by_verified DESC, is_verified DESC, created_at DESC`. Implement by joining/filtering on creator profile via embedded select (`profiles!inner(is_verified)`) or a generated column `creator_is_verified` populated by trigger for cheap sorting. **Chosen approach:** add `creator_is_verified boolean default false` to the four entity tables; trigger sets it from creator profile on insert; updated when profile flips to verified (one-shot UPDATE to all that user's rows).

### Auto-verify on create (no fee)
- The same `creator_is_verified=true` trigger also sets `is_verified=true` on the entity row (skipping the existing entity-level verification request flow).

## 2. Commission Config fixes

### Add User Verification Fee row
- In `AdminCommissionConfig.tsx`, add a new card row "Account Verification Fee" bound to `platform_settings.user_verification_fee`.

### Fix Mchango commission rate not editable
**Root cause:** `payment-stk-callback` and `c2b-confirm-payment` use the hardcoded `COMMISSION_RATES.MCHANGO = 0.07` from `_shared/commissionRates.ts`. The admin slider writes to `platform_settings.commission_rate_mchango` but nothing reads it.

**Fix:** Make the rate dynamic.
- New helper `_shared/getCommissionRate.ts` that fetches `platform_settings.commission_rate_<type>` (mchango/organization/welfare) with fallback to the constant.
- Update mchango branch in `payment-stk-callback/index.ts` and `c2b-confirm-payment/index.ts` to call `await getCommissionRate(supabase, 'mchango')`.
- Same for organizations and welfare branches (welfare currently reads from `welfares.commission_rate` — keep that but seed from platform setting on welfare creation; admin slider stays the source of truth for new entities).
- Chama remains per-row (existing UI for that already works).

## Files to add/change

**New**
- `supabase/migrations/<ts>_account_verification.sql` (columns, table, bucket, RLS, triggers).
- `supabase/functions/request-account-verification/index.ts`
- `supabase/functions/admin-account-verification/index.ts`
- `supabase/functions/_shared/getCommissionRate.ts`
- `src/pages/AccountVerification.tsx`
- `src/pages/AdminUserVerifications.tsx`
- `src/components/profile/VerifiedBadge.tsx`

**Edited**
- `supabase/functions/payment-stk-callback/index.ts` — handle `account_verification` purpose; use dynamic rate for mchango/org.
- `supabase/functions/c2b-confirm-payment/index.ts` — dynamic rate for mchango/org.
- `src/pages/AdminCommissionConfig.tsx` — add user verification fee field.
- `src/components/admin/AdminSidebar.tsx` & `src/App.tsx` — route + nav for new admin page.
- Mchango/Chama/Welfare/Organization listing pages — order by `creator_is_verified, is_verified, created_at`.
- `src/components/Profile*` (or wherever profile menu lives) — "Get Verified" entry + badge.

No changes to chama-level commission UI. Existing entity-level `VerificationRequestButton` stays for groups whose creator is not yet verified (unchanged flow).