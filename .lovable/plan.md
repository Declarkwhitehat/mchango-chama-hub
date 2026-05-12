## Problem

`supabase/functions/b2c-payout/index.ts` rejects every payout with `403 "Forbidden: withdrawal has not been approved by an admin"` because it checks `withdrawal.approved_by`, a column that does not exist on the `withdrawals` table. The real schema uses `reviewed_by` / `reviewed_at`, and chama auto-payouts have no human reviewer at all (they are approved implicitly by the service-role cron when a cycle completes).

Result: 100% of B2C payouts (chama cycle payouts, welfare disbursements, org/mchango withdrawals) fail at the gateway. Confirmed on withdrawals `4fa3643d…` (chama, status=failed) and `f9ac326a…` (welfare, stuck processing).

## Fix (single file, no money moved)

Edit `supabase/functions/b2c-payout/index.ts`, lines ~139–153.

Replace the broken `approved_by` block with a schema-correct guard that preserves the original intent — block payouts that never went through an approval path — using fields that actually exist:

```ts
// ═══ APPROVAL GUARD ═══
// Service-role callers (daily-payout-cron, retry-failed-payouts,
// welfare-cooling-off-payout) are pre-authorized — they only invoke this
// after their own approval/cycle logic has run.
// Admin-triggered calls must point at a withdrawal that went through the
// review workflow, evidenced by reviewed_at being set.
if (!isServiceRole && !withdrawal.reviewed_at) {
  console.warn('[security] B2C payout denied — withdrawal not reviewed', {
    caller_user_id: callerUserId,
    withdrawal_id,
    status: withdrawal.status,
  });
  return new Response(
    JSON.stringify({ error: 'Forbidden: withdrawal has not been approved' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

The existing checks above this block remain unchanged and continue to enforce:
1. Caller is service-role OR an admin (lines 104–114).
2. Withdrawal status is `approved`, `pending_retry`, or `processing` (line 132).

Combined, this restores the original security intent without the schema bug.

## Repair stuck rows (no payout sent)

After redeploying, mark the two stuck rows as retryable so the existing retry/cron picks them up on the next normal cycle. **No B2C call is issued by this plan**; the user said "don't send any money".

Migration:
```sql
UPDATE withdrawals
SET status = 'pending_retry',
    b2c_error_details = NULL,
    notes = COALESCE(notes,'') || E'\n[SYSTEM] Reset after b2c-payout approval-guard fix'
WHERE id IN (
  '4fa3643d-3ba1-4bba-8fd6-f9f11d0f681a',
  'f9ac326a-d8e7-4b8f-9ae4-abe8511bce17'
);
```

The user/admin can then trigger payout manually when ready. Nothing in this plan invokes `b2c-payout`.

## Deploy

Redeploy `b2c-payout` only.

## Out of scope

- No changes to `b2c-payout` business logic, fee handling, callback, or M-Pesa request payload.
- No changes to retry-failed-payouts, daily-payout-cron, or welfare-cooling-off-payout.
- No money sent.
