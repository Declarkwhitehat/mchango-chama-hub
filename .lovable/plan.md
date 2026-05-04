## Goal

1. Reset the database to a clean testing state — keep only the single admin account (`declark07chacha@gmail.com`) and wipe everything else.
2. Stop compressing KYC ID photos so they upload at full original quality (matching the user's complaint about compressed images on campaigns/orgs being unclear).

---

## Part 1 — Database Wipe

**Preserve:** admin user `d8e34397-ba8c-4e33-b556-34965d4a269d` (auth.users row, profile, user_roles entry, their PIN/security questions so they can still log in), plus configuration tables (`fraud_config`, `platform_settings`).

**Delete everything else** via a migration (TRUNCATE … CASCADE where safe, or DELETE with admin-preservation filter). Tables to clear:

- Groups & members: `chama`, `chama_members`, `chama_invite_codes`, `chama_messages`, `chama_member_debts`, `chama_member_removals`, `chama_cycle_deficits`, `chama_cycle_history`, `chama_overpayment_wallet`, `chama_rejoin_requests`, `contribution_cycles`, `contributions`, `member_cycle_payments`, `payout_skips`, `payouts`, `payout_approval_requests`, `member_trust_scores`
- Welfare: `welfares`, `welfare_members`, `welfare_contributions`, `welfare_contribution_cycles`, `welfare_withdrawal_approvals`, `welfare_executive_changes`, `welfare_leave_requests`
- Organizations: `organizations`, `organization_donations`
- Campaigns: `mchango`, `mchango_donations`
- Financial: `withdrawals`, `transactions`, `financial_ledger`, `company_earnings`, `platform_financial_summary`, `reconciliation_logs`, `settlement_locks`, `payment_methods`
- Misc: `notifications`, `device_tokens`, `chat_messages`, `customer_callbacks`, `generated_documents`, `group_documents`, `fraud_events`, `audit_logs`, `rate_limit_attempts`, `otp_verifications`, `verification_requests`, `user_verification_requests`, `user_consents`, `user_risk_profiles`
- All non-admin user data: delete from `auth.users` where id ≠ admin id (cascades via FKs to `profiles`, `user_roles`, `user_pins`, `totp_secrets`, `webauthn_credentials`, `security_questions`, `user_security_answers`).

**Sequences**: reset `document_serial_seq` and any member-code sequences so test data starts at 1.

**Storage buckets**: ask user if KYC/avatar/group-document storage objects should also be wiped (separate operation; not auto-included).

## Part 2 — KYC Photo Quality Fix

File: `src/pages/KYCUpload.tsx`

Currently both front and back ID photos are run through `compressImage()` from `src/utils/imageCompression.ts`, which lowers quality and resolution. ID photos need full clarity.

Change: bypass `compressImage` entirely in `KYCUpload.tsx` — store the original `File` directly into `setFrontFile` / `setBackFile` and use the original blob for preview. Keep a sane file-size guard (e.g. reject > 10 MB) and convert HEIC if needed, but no quality reduction.

Note: `AccountVerification.tsx` selfie uses Capacitor camera `quality: 80`. Bump to `quality: 100` so selfies are also uncompressed.

`OrganizationCreate.tsx` and `MchangoCreate.tsx` keep their existing compression (those are public-facing thumbnails — the user only flagged KYC).

---

## Confirmations needed before I run the wipe

1. Wipe also clears Storage objects (KYC docs, group documents, mchango images)? Y/N
2. Confirm the only admin to keep is `declark07chacha@gmail.com` (id `d8e34397…`)? Y/N

I'll proceed once you approve. The wipe is irreversible.
