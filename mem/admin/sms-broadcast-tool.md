---
name: Admin SMS Broadcast Tool
description: Admin-only segmented Onfon SMS sender at /admin/sms-broadcast backed by admin-sms-broadcast edge function with preview-count-then-confirm flow.
type: feature
---
Page: `src/pages/AdminSmsBroadcast.tsx`. Edge function: `supabase/functions/admin-sms-broadcast/index.ts` (verify_jwt default; checks `has_role(admin)` server-side).

Segments supported: `all_users`, `kyc_approved`, `kyc_missing`, `chama_creators`, `chama_members`, `welfare_creators`, `welfare_members`, `mchango_creators`, `mchango_donors`, `top_trust` (trust_score ≥ 80). Phones normalized to `254XXXXXXXXX`, deduplicated, sent via Onfon `SendBulkSMS` as separate `MessageParameters` entries in batches of 20.

Every broadcast is logged in `admin_sms_broadcasts` (segment, message, recipient_count, sent_count, failed_count, status). Preview mode returns recipient count without sending. Tagline `"sisi tuko pamoja, je wewe?"` is auto-appended unless already in message or admin toggles off. No hard cap — admin confirms via AlertDialog showing recipient count + message preview.
