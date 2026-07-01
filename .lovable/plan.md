
## Feature: Daily M-Pesa Limit Increase Request (KES 150,000 → up to 500,000)

Users can request a temporary/permanent daily payout limit increase from their Profile. Admin reviews with full context and approves or rejects.

### 1. Database (migration)

**New table `daily_limit_increase_requests`:**
- `user_id` (uuid, FK auth.users)
- `current_limit` (numeric, default 150000)
- `requested_limit` (numeric, 150001–500000)
- `reason` (text, 20–500 chars)
- `status` (text: `pending` | `approved` | `rejected`)
- `otp_verified_at` (timestamptz)
- `admin_notes` (text)
- `reviewed_by` (uuid)
- `reviewed_at` (timestamptz)
- `expires_at` (timestamptz, default now()+30 days when approved)
- `created_at`, `updated_at`
- GRANTs to `authenticated` + `service_role`
- RLS: users read/insert their own; admins read/update all

**Add to `profiles`:**
- `custom_daily_limit` (numeric, nullable) — set on approval
- `custom_daily_limit_expires_at` (timestamptz, nullable)

### 2. Backend edge functions

- **`request-daily-limit-increase`** — validates OTP (reuse existing `otp_verifications` flow with purpose `daily_limit_increase`), enforces one pending request per user, inserts row, notifies admin via existing notification/SMS pipeline.
- **`admin-daily-limit-decision`** — super-admin/admin gated; approves (writes `custom_daily_limit` + `expires_at`) or rejects with notes; logs to `admin_action_log`; SMS user via Onfon.

### 3. Frontend — user side (`src/pages/Profile.tsx` or new component)

Add card **"Daily Payout Limit"** showing current effective limit. Button **"Request Increase"** opens dialog:
1. Slider/input 150,001–500,000
2. Reason textarea (min 20 chars)
3. Send OTP to registered phone → enter 6-digit code
4. Submit → shows pending badge until admin decides

Uses existing OTP infra (`otp-send` / `otp-verify` functions).

### 4. Frontend — admin side (new page `src/pages/AdminDailyLimitRequests.tsx`)

New sidebar item under Admin. Each request card shows:
- User profile: name, phone, current phone-change history (query `customer_callbacks` for "Payment Method Change Request" entries by this user)
- Phone number age (last updated_at on `profiles.phone`)
- KYC status + verification tier
- Requested amount, reason
- **Latest 10 transactions** (query `withdrawals` + `contributions` + `mchango_donations` for user_id, sorted desc)
- Trust score if available (`member_trust_scores`)
- Approve / Reject buttons with optional notes + validity duration (30/60/90 days or permanent)

Route wired in `src/App.tsx` behind `AdminProtectedRoute`.

### 5. Enforcement

Update `PAYMENT_METHOD_LIMITS` usage: withdrawal path reads effective limit = `profiles.custom_daily_limit` if not expired, else 150,000. Applied in:
- `src/components/WithdrawalButton.tsx` / withdrawal edge function limit check
- `PaymentMethodsManager.tsx` display

### 6. Notifications

- On submit → admin push + in-app notification
- On decision → user SMS + in-app notification with reason

### Not changed
- Bank account limit stays 500k
- No change to payment number change flow
- No change to KYC or verification flows

Please confirm and I'll implement.
