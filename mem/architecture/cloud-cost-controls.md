---
name: Cloud Cost Controls
description: Measures keeping Lovable Cloud credit usage low — cron run-history retention, job frequencies, compute size
type: feature
---

## Disk
- `cron.job_run_details` grows unbounded and was 1.26 GB of a 1.27 GB database (Aug 2026). Truncated; DB fell to 38 MB.
- Daily cron `purge-cron-run-details-daily` (01:00 UTC) deletes run history older than 3 days. Never remove it.

## Cron frequency (reduced for cost, functionality unchanged)
- `mchango-expiry-reminders-hourly` → daily 06:00 UTC
- `chama-grace-reminders-every-30min` → every 6 hours
- `process-document-deletions-hourly` → daily 04:00 UTC
- `kyc-auto-cleanup-36h` → daily 02:00 UTC
- Never slow down `daily-payout-2100-eat`, `chama-auto-maintenance-2hr`, or the reminder SMS/push jobs — they are user-visible.

## Log retention
- `purge_old_logs()` deletes rows older than 90 days from `audit_logs`, `admin_action_log`, `reconciliation_logs`, and resolved `fraud_events`.
- Scheduled weekly as `purge-old-logs-weekly` (Sun 02:30 UTC).

## Compute
- Instance size is **Mini**. Earlier "Cloud compute large" charges are historical, not current run rate.
- Only upsize if db_health shows memory/connection saturation or OOM kills.

## Cost split reality check
- Build/plan mode messages dominate total credit spend (~75%); Cloud is the minority. Cloud egress/functions/storage are negligible.
