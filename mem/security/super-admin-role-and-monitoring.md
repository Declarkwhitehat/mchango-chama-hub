---
name: Super admin role and monitoring
description: Super admin is the only role allowed to create/revoke admins and access high-risk surfaces; admin_action_log captures who did what
type: feature
---
## Roles
- `app_role` enum: `user`, `admin`, `super_admin`.
- Current super admin: Declark (`d8e34397-ba8c-4e33-b556-34965d4a269d`).
- Only super_admin can INSERT/DELETE rows in `user_roles` for role `admin`/`super_admin` (RLS enforced).

## Super-admin only surfaces (privilege code still required as 2nd factor)
Pages (wrapped with `SuperAdminProtectedRoute` AND `AdminProtectedRoute`):
`/admin/audit`, `/admin/payment-config`, `/admin/ledger`, `/admin/commission-analytics`,
`/admin/commission-config`, `/admin/revenue`, `/admin/maintenance`, `/admin/sms-balance`,
`/admin/sms-broadcast`, `/admin/paybill-balance`.
Plus UsersManagement buttons: Make/Remove Admin, Delete, Restore.

Edge functions: `admin-sms-broadcast`, `admin-delete-user`, `paybill-balance-query`
verify caller has `super_admin` role server-side via `is_super_admin(_user_id)`.

## Monitoring
Table `admin_action_log` (super_admin SELECT only) captures every privileged action.
- Auto-logged: role grants/revokes via `user_roles_audit_trg`.
- Logged by edge functions: SMS broadcast, user delete/restore, paybill balance query.
- Logged client-side via `logAdminAction()` helper: maintenance toggle, commission config update.

Surfaced in `/admin/audit` → **Admin Actions** tab with admin / action_key / free-text filters.
`/admin/audit` itself is super-admin only — regular admins never see it.

## How to grant a new admin
Only the super admin sees "Make Admin" in `UsersManagement`. The DB RLS policy blocks any other role from inserting an admin row even if the UI is bypassed.
