

# Admin Dashboard Power Upgrades

## Overview
Seven enhancements to make the admin panel more powerful: enriched verification requests, active account metrics, commission management, withdrawal double-transaction protection, super managers leaderboard, deadline adjustments, and document deletion.

---

## 1. Verification Requests — Enriched Detail View

**What**: When reviewing a verification request, show account creation date, creator's ID/photo, phone number, and amount collected for the entity.

**How**: In `VerificationRequestsManagement.tsx`, expand the `fetchRequests` enrichment to also pull:
- `profiles.created_at`, `profiles.phone`, `profiles.id_number`, `profiles.kyc_front_id`, `profiles.kyc_back_id` for the requester
- Entity's `current_amount` / `available_balance` and `created_at`
- Display these in the request card (expandable detail section) with KYC photo previews from storage

**Files**: `src/components/admin/VerificationRequestsManagement.tsx`

---

## 2. Active Account Metrics Banner

**What**: Show a prominent metric at the top of the admin dashboard: "X active accounts" — users who are members of at least one active Chama, Welfare, Campaign, or Organization.

**How**: Add a new query in `AdminDashboard.tsx` that counts distinct user IDs across `chama_members` (active), `welfare_members` (active), `mchango` creators/donors, and `organization_donations` donors. Display as a highlighted card or banner above the existing metric cards.

**Files**: `src/pages/AdminDashboard.tsx`

---

## 3. Commission Management (Password-Protected)

**What**: Admin can change global commission rates (Chama, Mchango, Organization, Welfare). Secured with a Super Admin password dialog.

**How**:
- Create a new DB table `platform_settings` with key-value rows for each commission rate (via migration)
- Create a new admin page `AdminCommissionConfig.tsx` with rate inputs and a password confirmation dialog (using the existing admin privilege code pattern)
- Update `commissionCalculator.ts` and edge functions to read rates from DB instead of hardcoded constants
- Add sidebar entry under "Financial" group

**Files**: New `src/pages/AdminCommissionConfig.tsx`, migration for `platform_settings` table, update `src/utils/commissionCalculator.ts`, update edge function commission logic, `src/components/admin/AdminSidebar.tsx`

---

## 4. Withdrawal Double-Transaction Protection

**What**: Prevent duplicate withdrawal processing — disable action buttons while processing, check for existing completed withdrawals with the same payment reference.

**How**: In `WithdrawalsManagement.tsx`:
- Add a processing lock map to disable approve/retry buttons for any withdrawal already being actioned
- Before processing, query for existing completed withdrawals with the same `user_id` + `entity_id` + status `processing`/`completed` within the last hour
- Show a warning if a duplicate is detected
- The backend `process_withdrawal_completion` RPC already checks for duplicate receipts — add a frontend guard layer too

**Files**: `src/components/admin/WithdrawalsManagement.tsx`

---

## 5. Super Managers Section (Top 100)

**What**: A new admin page showing the top 100 group creators ranked by success rate (completion rate, total collected, member activity).

**How**:
- New page `AdminSuperManagers.tsx` that queries creators across Chamas, Welfares, and Organizations
- Calculate success metrics: total amount collected, member count, completion percentage
- Rank and display top 100 with their entity names, type, and metrics
- Add sidebar entry under "Users & KYC" group

**Files**: New `src/pages/AdminSuperManagers.tsx`, `src/components/admin/AdminSidebar.tsx`, route in `src/App.tsx`

---

## 6. Deadline Adjustments (Admin Override)

**What**: Admin can reduce/adjust deadlines (time and amount) set by group executives for Welfare contribution cycles and Chama cycles.

**How**:
- New component `AdminDeadlineAdjust.tsx` — a dialog accessible from the Chama/Welfare detail admin pages
- Allows editing `contribution_amount`, `end_date`, or cycle deadlines
- Logs the change in `audit_logs` for accountability
- Accessible from `AdminChamaDetail` and `AdminWelfares` pages

**Files**: New `src/components/admin/AdminDeadlineAdjust.tsx`, update `src/pages/AdminChamaDetail.tsx`, update `src/pages/AdminWelfares.tsx`

---

## 7. Document Management — Admin Delete

**What**: Admin can delete group documents from the system.

**How**: In `GroupDocuments.tsx`, add a delete button visible only to admin users. Also add delete capability to `AdminDocuments.tsx` for verified documents. The delete action removes both the storage file and the DB record, with a confirmation dialog.

**Files**: `src/components/GroupDocuments.tsx`, `src/pages/AdminDocuments.tsx`

---

## Technical Notes

- Commission rate changes require a new `platform_settings` table (migration) and updates to multiple edge functions that currently import from `_shared/commissionRates.ts`
- The Super Admin password protection reuses the existing admin privilege code pattern (`D3E9C0L1A3R9K`)
- All admin-only mutations will be guarded by the `has_role` check
- New routes will be added to `src/App.tsx` wrapped in `AdminProtectedRoute`

