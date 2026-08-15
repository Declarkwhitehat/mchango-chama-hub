---
name: Payout receipt SMS guarantee
description: Every completed withdrawal/payout triggers a receipt SMS via DB trigger; all edge SMS must route through send-transactional-sms
type: feature
---
- All edge functions must send SMS via `_shared/sendSms.ts`, which posts to `send-transactional-sms` (the only place with working Onfon credentials + sanitization). Do NOT read `ONFON_ACCESS_KEY` (unset) or use Celcom (`CELCOM_*`, dead provider) — both silently fail.
- DB trigger `trg_notify_payout_receipt_sms` on `withdrawals` (AFTER UPDATE OF status → completed) calls edge function `payout-receipt-sms` via pg_net.
- `payout-receipt-sms` resolves source entity (chama/welfare/campaign/organization), recipient phone, and sends: "Confirmed. You have received KES X from <name> <type> on <date>. Receipt: <ref>." plus an in-app notification.
- Idempotency: `withdrawals.metadata.payout_sms_sent_at` (also respects `debt_sms_sent_at`). Clearing the key allows a resend.
