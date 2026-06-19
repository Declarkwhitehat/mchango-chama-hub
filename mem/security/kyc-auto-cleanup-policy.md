---
name: KYC Auto-Cleanup Policy
description: 14-day auto-deletion of accounts that never complete KYC, with SMS reminders every 72h
type: feature
---
Edge function `kyc-auto-cleanup` runs every 6 hours via pg_cron (`kyc-auto-cleanup-6h`).

For each profile where `kyc_status != 'approved'` AND `deleted_at IS NULL` AND `created_at <= now()-72h`:

- **Reminders** at buckets 1/2/3/4 (72h, 144h, 216h, 288h after signup). SMS via Onfon + in-app notification. Deduped via `kyc_reminders_sent (user_id, bucket UNIQUE)`.
- **Soft-delete at 14 days** (336h): sets `deleted_at`, `deletion_reason='kyc_not_verified_14d'`, marks non-manager memberships as `left`, bans auth user 876000h, writes `audit_logs` row with `action='AUTO_DELETE_KYC'`. Final SMS sent.

Exclusions (skip delete, still allowed to remind):
- admin / super_admin role
- pending/approved/processing/pending_retry withdrawal
- manager of an active or pending chama
- `kyc_status='pending'` with `kyc_submitted_at` < 14d ago — clock paused until review

SMS templates are GSM-7 sanitized, no emojis (per platform SMS policy).
