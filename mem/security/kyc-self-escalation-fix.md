---
name: KYC Self-Escalation Lock
description: Profiles RLS + BEFORE UPDATE trigger prevent users from self-marking kyc_status='approved' or is_verified=true; only admins or service-role can change KYC/verification columns.
type: constraint
---
The `profiles` "Users can update own profile" policy alone is insufficient — non-admin updates run through `prevent_kyc_self_escalation` BEFORE UPDATE trigger which forces `kyc_status`, `is_verified`, `kyc_submitted_at`, `kyc_reviewed_at`, `kyc_reviewed_by`, `kyc_rejection_reason`, `verified_at` back to OLD values. **Why:** earlier, anyone could `UPDATE profiles SET kyc_status='approved'` from the browser and then create welfares/chamas/orgs (RLS gates only check `kyc_status='approved'`). All creation paths must additionally validate KYC server-side; `welfare-crud` insert is now gated like `chama-crud` and `mchango-crud`.
