---
name: Creator delete expired campaign + abandoned funds
description: Creators can delete their own mchango only after end_date passes, with title-match confirmation; any remaining balance sweeps to company revenue via sweep_mchango_to_revenue RPC and is recorded in abandoned_funds_ledger. Admin page /admin/abandoned-funds surfaces all forfeitures.
type: feature
---
Rules:
- Delete UI (DeleteExpiredCampaignCard) only renders when isCreator && isExpired.
- User must type the exact campaign title (case-insensitive) to enable delete.
- If available_balance > 0, show explicit warning that funds will move to platform revenue; sweep runs before row delete.
- Edge function `mchango-creator-delete` blocks deletion if any pending/processing/approved withdrawal exists on the campaign.
- All forfeitures write to `abandoned_funds_ledger` (RLS: admin OR super_admin read). Unique index (source_type, source_id, reason) prevents double-sweep.
- Sweep also inserts `company_earnings` row with source='abandoned_funds'.
- Admin page: /admin/abandoned-funds (admin-only; not super-admin-gated so both roles can audit).
- Extend the same ledger later for welfare/chama/user_account deletions with balance.
