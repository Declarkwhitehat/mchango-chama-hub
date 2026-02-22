

## Fraud Detection & Risk Monitoring Module

### Overview
This plan adds a comprehensive fraud detection and risk monitoring system to the existing admin dashboard. It integrates safely into the current database, edge functions, and admin UI without modifying core payment logic.

---

### Phase 1: Database Tables & Schema

**New Tables:**

1. **`fraud_events`** -- Immutable fraud log table
   - `id` (uuid, PK)
   - `user_id` (uuid, references profiles)
   - `transaction_id` (uuid, nullable)
   - `rule_triggered` (text) -- e.g. "rapid_transactions", "failed_login_burst"
   - `risk_points_added` (integer)
   - `total_risk_score` (integer) -- snapshot at time of event
   - `ip_address` (text)
   - `device_info` (jsonb, nullable)
   - `metadata` (jsonb, nullable) -- extra context
   - `admin_action` (text, nullable) -- populated later by admin
   - `created_at` (timestamptz, default now())
   - RLS: SELECT only for admins. INSERT for service role. No UPDATE or DELETE policies (immutable).

2. **`fraud_config`** -- Super-admin configurable fraud rules
   - `id` (uuid, PK)
   - `rule_key` (text, unique) -- e.g. "max_withdrawal_per_day", "max_failed_logins"
   - `rule_value` (jsonb) -- flexible value storage
   - `description` (text)
   - `updated_by` (uuid)
   - `updated_at` (timestamptz)
   - `created_at` (timestamptz)
   - RLS: SELECT/UPDATE for admins only. No DELETE.

3. **`user_risk_profiles`** -- Risk scoring per user (separate from profiles table per security rules)
   - `id` (uuid, PK)
   - `user_id` (uuid, unique, references profiles)
   - `risk_score` (integer, default 0)
   - `risk_level` (text, default 'low') -- low/medium/high/critical
   - `is_flagged` (boolean, default false)
   - `is_frozen` (boolean, default false)
   - `frozen_at` (timestamptz, nullable)
   - `frozen_by` (uuid, nullable)
   - `review_status` (text, default 'none') -- none/under_review/cleared/escalated
   - `reviewed_by` (uuid, nullable)
   - `reviewed_at` (timestamptz, nullable)
   - `last_risk_update` (timestamptz)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)
   - RLS: SELECT/UPDATE for admins. INSERT for service role.

**Seed data for `fraud_config`:**
- `max_withdrawal_per_day`: 500000
- `max_transactions_per_hour`: 20
- `max_failed_logins`: 5
- `max_failed_2fa_attempts`: 3
- `rapid_transaction_window_minutes`: 5
- `rapid_transaction_threshold`: 5
- `abnormal_withdrawal_multiplier`: 3.0
- `device_detection_enabled`: true

---

### Phase 2: Edge Function -- `fraud-monitor`

A single new edge function that handles fraud event recording and risk score calculation.

**Endpoints (via action parameter):**

- `record-event`: Called by other edge functions (login, transactions, withdrawals) to log a fraud event
  - Accepts: user_id, rule_triggered, risk_points, ip_address, device_info, transaction_id
  - Inserts into `fraud_events`
  - Updates `user_risk_profiles` (upsert risk_score, recalculate risk_level)
  - If score reaches critical (81+): auto-flags account, optionally freezes

- `get-user-risk`: Returns risk profile for a user (admin use)

- `get-flagged-users`: Returns paginated list of flagged/high-risk users with filters

- `admin-action`: Allows admin to take action on a user (mark under review, clear, freeze, escalate)
  - Logs the action in `audit_logs`

- `get-fraud-events`: Returns paginated fraud events with filters (user, date range, rule type)

- `get-config` / `update-config`: Read/write fraud configuration (super admin only)
  - Config changes logged in `audit_logs`

---

### Phase 3: Integration Points (Minimal Changes to Existing Functions)

Add fraud monitoring calls to existing edge functions without changing their core logic:

1. **`login/index.ts`** -- After failed login, call fraud-monitor with "failed_login" rule (+5 points). After successful login from new IP, log "new_ip_login" (+3 points).

2. **`totp-2fa/index.ts`** -- After failed 2FA attempt, call fraud-monitor with "failed_2fa" rule (+10 points).

3. **`withdrawals-crud/index.ts`** -- Before processing withdrawal, check if amount exceeds daily limit or is abnormally high compared to user history. Log "abnormal_withdrawal" or "daily_limit_exceeded" events.

4. **`mpesa-stk-push/index.ts`** -- Check rapid transaction frequency. Log "rapid_transactions" if threshold exceeded.

These are lightweight `fetch()` calls to the fraud-monitor function added at the end of existing logic -- they do not block or slow the main flow (fire-and-forget pattern).

---

### Phase 4: Admin Dashboard UI

**New sidebar menu item** under a new "Security" group:
- "Fraud & Risk Monitoring" (with badge showing critical-count)

**New admin pages:**

1. **`/admin/fraud-monitoring`** -- Main fraud dashboard
   - Summary cards: Total flagged users, critical risk count, events today, frozen accounts
   - Flagged users table with columns: User, Risk Score, Risk Level, Status, Last Event, Actions
   - Filters: risk level, date range, search by user name/phone/ID
   - Actions per user: View Details, Mark Under Review, Clear, Freeze, Escalate

2. **`/admin/fraud-user/:userId`** -- Detailed fraud timeline for a user
   - User info card with risk score gauge
   - Timeline of all fraud events (immutable log)
   - Admin action history
   - Action buttons

3. **`/admin/fraud-config`** -- Fraud rule configuration (super admin)
   - Editable form for all fraud rules
   - Each change logged in audit logs

**New components:**
- `src/components/admin/FraudMonitoringDashboard.tsx`
- `src/components/admin/FraudUserDetail.tsx`
- `src/components/admin/FraudConfigPanel.tsx`
- `src/components/admin/RiskScoreBadge.tsx` -- color-coded badge (green/yellow/orange/red)

**Sidebar update:** Add "Security" group with "Fraud & Risk" menu item in `AdminSidebar.tsx`.

**Route additions in `App.tsx`:**
- `/admin/fraud-monitoring`
- `/admin/fraud-user/:userId`
- `/admin/fraud-config`

---

### Phase 5: Risk Score Calculation Logic

Risk points per rule (configurable via fraud_config):
- Failed login: +5
- Failed 2FA: +10
- New IP login: +3
- Rapid transactions (>threshold/hour): +15
- Abnormal withdrawal amount: +20
- Daily withdrawal limit exceeded: +25
- Duplicate phone/ID detected: +30

Score decay: Risk scores reduce by 5 points per week of clean activity (handled by a check during score updates).

Risk level mapping:
- 0-30: Low (green)
- 31-60: Medium (yellow)
- 61-80: High (orange)
- 81+: Critical (red) -- auto-flag, optional freeze

---

### Technical Details

**Files to create:**
- `supabase/functions/fraud-monitor/index.ts`
- `src/pages/AdminFraudMonitoring.tsx`
- `src/pages/AdminFraudUserDetail.tsx`
- `src/pages/AdminFraudConfig.tsx`
- `src/components/admin/FraudMonitoringDashboard.tsx`
- `src/components/admin/FraudUserDetail.tsx`
- `src/components/admin/FraudConfigPanel.tsx`
- `src/components/admin/RiskScoreBadge.tsx`

**Files to modify (minimal changes):**
- `src/App.tsx` -- Add 3 new admin routes
- `src/components/admin/AdminSidebar.tsx` -- Add "Security" group with fraud menu item
- `supabase/functions/login/index.ts` -- Add fire-and-forget call to fraud-monitor after failed/successful login
- `supabase/config.toml` -- Add `[functions.fraud-monitor]` with `verify_jwt = false`

**Database migration:** Single migration creating all 3 tables, RLS policies, and seed data for fraud_config.

