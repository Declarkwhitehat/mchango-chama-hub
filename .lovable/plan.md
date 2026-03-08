

## Plan: Admin Delete User + Frozen/Flagged Account Withdrawal Controls

### 1. Admin Delete User

**Add "Delete User" button to `UsersManagement.tsx` and `AdminUserDetail.tsx`**

- Add a red "Delete User" button with a confirmation dialog requiring the admin privilege code
- Deletion will cascade-remove user data via a new edge function `admin-delete-user` that uses the service role to:
  - Delete from `user_roles`, `totp_secrets`, `payment_methods`, `otp_verifications`, `chat_messages`, `user_risk_profiles`, `fraud_events`, `notifications`, `audit_logs` (by user_id)
  - Remove chama memberships (`chama_members`), welfare memberships (`welfare_members`)
  - Delete user's KYC documents from storage (`id-documents` bucket)
  - Delete the `profiles` row
  - Finally delete from `auth.users` using `supabase.auth.admin.deleteUser()`
- Admin privilege code required before execution

**Files:**
- **Create** `supabase/functions/admin-delete-user/index.ts`
- **Edit** `src/components/admin/UsersManagement.tsx` — add Delete button per user row
- **Edit** `src/pages/AdminUserDetail.tsx` — add Delete button in header

### 2. Frozen/Flagged Accounts: Admin Approval Required for Withdrawals

**Modify `withdrawals-crud/index.ts` POST handler** to check if the requesting user has a `user_risk_profiles` record where `is_frozen = true` OR `is_flagged = true`. If so:
- Instead of blocking, auto-set withdrawal status to `pending_approval` (reusing the existing welfare approval status)
- Store a note: "Requires admin approval — account is frozen/flagged"
- The existing admin `WithdrawalsManagement` UI already handles `pending_approval` status with approve/reject actions, so no UI changes needed for the approval flow

**Files:**
- **Edit** `supabase/functions/withdrawals-crud/index.ts` — add frozen/flagged check in the POST (create withdrawal) handler, right after KYC verification. Query `user_risk_profiles` using the admin client. If frozen or flagged, override the initial status to `pending_approval`.

### 3. Update config.toml

- Add `admin-delete-user` function entry with `verify_jwt = false`

### Summary of files
1. **Create** `supabase/functions/admin-delete-user/index.ts`
2. **Edit** `supabase/functions/withdrawals-crud/index.ts`
3. **Edit** `src/components/admin/UsersManagement.tsx`
4. **Edit** `src/pages/AdminUserDetail.tsx`

