---
name: Cloud Cost Controls
description: Measures keeping Lovable Cloud credit usage low — cron run-history retention, job frequencies, compute size
type: feature
---

## Disk
- `cron.job_run_details` grows unbounded and was 1.26 GB of a 1.27 GB database (Aug 2026). Truncated; DB fell to 38 MB.
- Daily cron `purge-cron-run-details-daily` (01:00 UTC) deletes run history older than 3 days. Never remove it.

## Cron frequency (reduced for cost, functionality unchanged)
- `mchango-expiry-reminders-hourly` → every 4 hours
- `chama-grace-reminders-every-30min` → every 4 hours
- `process-document-deletions-hourly` → every 12 hours

## Compute
- Instance size is **Mini**. Earlier "Cloud compute large" charges are historical, not current run rate.
- Only upsize if db_health shows memory/connection saturation or OOM kills.

## Cost split reality check
- Build/plan mode messages dominate total credit spend (~75%); Cloud is the minority. Cloud egress/functions/storage are negligible.
