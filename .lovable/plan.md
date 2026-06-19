# Super Admin Role + Admin Monitoring

## Goals
1. Promote the current admin (`d8e34397-…a269d`) to **super_admin**.
2. Only **super_admin** can create / revoke admins.
3. Regular admins lose access to high-risk surfaces — every page/function currently behind the `D3E9C0L1A3R9K` privilege code becomes **super_admin only** (code stays as a second factor).
4. Super admin gets a rich **admin activity monitor** (who did what, when, from where).

## 1. Database — new role + protections
Migration:
- Add `'super_admin'` to the `public.app_role` enum.
- Insert `('d8e34397-…a269d', 'super_admin')` into `user_roles`.
- New SECURITY DEFINER function `public.is_super_admin(_user_id uuid) returns boolean`.
- RLS on `user_roles`:
  - INSERT / DELETE of rows where `role in ('admin','super_admin')` → only `is_super_admin(auth.uid())`.
  - Existing self-read policies stay.
- Trigger `user_roles_audit_trg` → writes `audit_logs` row on every INSERT/DELETE of `admin`/`super_admin` (actor = `auth.uid()`, target = `user_id`).
- New table **`admin_action_log`** (richer than `audit_logs`, super-admin-only RLS):
  - columns: `actor_user_id`, `actor_email`, `action_key` (e.g. `sms_broadcast.send`, `paybill.balance_query`, `commission.config_update`, `user.delete`, `maintenance.toggle`, `ledger.view`), `target_type`, `target_id`, `metadata jsonb`, `ip_address`, `user_agent`, `created_at`.
  - GRANTs: `authenticated` INSERT only via SECURITY DEFINER RPC `log_admin_action(...)`; SELECT restricted to super_admin.

## 2. Frontend — role gate + UI hiding
- New hook `useIsSuperAdmin()` (queries `user_roles` for `super_admin`, cached via react-query).
- New `<SuperAdminProtectedRoute>` component (mirrors `AdminProtectedRoute`) — redirects non-super-admins to `/admin` with a toast.
- **Routes wrapped with `SuperAdminProtectedRoute`** in `src/App.tsx`:
  - `/admin/sms-broadcast` (AdminSmsBroadcast)
  - `/admin/sms-balance` (AdminSmsBalance)
  - `/admin/paybill-balance` (AdminPaybillBalance)
  - `/admin/commission-config` (AdminCommissionConfig)
  - `/admin/commission-analytics` (AdminCommissionAnalytics)
  - `/admin/payment-config` (AdminPaymentConfig)
  - `/admin/maintenance` (AdminMaintenanceMode)
  - `/admin/revenue` (AdminRevenue)
  - `/admin/ledger` (AdminLedger)
  - `/admin/audit` (AdminAudit)
  - User delete + role-grant flows inside `AdminUserDetail` / `UsersManagement`
- **AdminDashboard nav tiles** for those pages render only when `useIsSuperAdmin()` is true (regular admins simply don't see them).
- **UsersManagement**: "Make Admin" / "Remove Admin" / "Delete user" / "Restore user" buttons render only for super admin.
- **Privilege-code dialog kept** on each gated page exactly as today — super admins still type `D3E9C0L1A3R9K` once per session (second factor preserved).

## 3. Edge functions — server-side super_admin check
Add a shared helper `supabase/functions/_shared/requireSuperAdmin.ts` (validates JWT, calls `is_super_admin` RPC with service role). Apply it (in addition to current privilege-code check) to:
- `admin-sms-broadcast`
- `admin-delete-user`
- `paybill-balance-query`
- `admin-sms-balance` (if exists; otherwise wherever SMS balance is fetched)
- `commission-config-update`, `payment-config-update`, `maintenance-toggle`, `revenue-report`, `financial-ledger-*` (only the functions that actually exist — others enforced purely client-side + RLS).

Each successful call also writes one `admin_action_log` row via the new RPC.

## 4. Super-admin audit/monitoring UI
Upgrade `AdminAudit` page (super_admin only):
- Two tabs: **Admin Actions** (new `admin_action_log`) and **System Audit** (existing `audit_logs`).
- Admin Actions tab columns: timestamp, admin (name + email via join on `profiles`), action_key (human-readable label), target, IP, metadata expand.
- Filters: admin (dropdown of all current admins), action_key, date range, free-text search.
- Server-side pagination, 50/page.
- Live badge on `AdminDashboard` showing "X admin actions in last 24h" linking here.

## 5. Memory
Update `mem/security/sms-broadcast-privilege-gate.md` → generalize to "Super-admin privilege gate". Add new memory `mem/security/super-admin-role-and-monitoring.md` documenting role hierarchy, the gated surfaces, and the audit pipeline. Update `mem/index.md` Core line about admin roles.

## Out of scope
- No changes to non-privileged admin pages (search, chama detail, withdrawals, etc.) — regular admins keep those.
- No change to existing welfare / chama RLS.

## Technical notes
- Enum add must be its own statement; `ALTER TYPE ... ADD VALUE 'super_admin'` cannot run in the same transaction that uses the new value, so we'll either split into two migrations or wrap the seed insert in a separate `DO` block / second migration.
- `is_super_admin` follows the existing `has_role` SECURITY DEFINER pattern to avoid RLS recursion.
- All new SELECT policies on `admin_action_log` use `is_super_admin(auth.uid())`.
