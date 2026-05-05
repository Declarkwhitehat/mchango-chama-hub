---
name: Self Account Deletion Flow
description: User-initiated account deletion via password + DELETE MY ACCOUNT phrase, soft-delete + auth ban
type: feature
---
Endpoint: `delete-my-account` edge function (verify_jwt=false, validates Bearer token in code).

Required body: `{ confirm_phrase: "DELETE MY ACCOUNT", password }`. Password re-verified via `signInWithPassword`.

Blocks deletion when user:
- has admin/super_admin role
- has pending/approved/processing/pending_retry withdrawal
- is manager of an active or pending chama (must transfer leadership first)

On success: profile soft-deleted (`deleted_at`, `deletion_reason='user_self_deletion'`), non-manager memberships set to `left`, auth user banned 876000h, audit_logs row written. Client signs out and routes to `/`.

UI lives in `src/pages/Security.tsx` Danger Zone card → AlertDialog with phrase + password inputs.
