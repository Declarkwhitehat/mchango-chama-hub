## Phase 2 — Per-Debt B2C Settlement + Dual SMS

Keep the existing FIFO per-debt disbursement intact. Each cleared deficit principal continues to fire its own `withdrawals` row + its own `b2c-payout` call + its own M-Pesa fee. The only new behavior is **dual SMS (payer + recipient)** dispatched once Safaricom confirms each B2C transfer.

### What stays the same
- `contributions-crud/index.ts` → `settleDebts()` FIFO loop is **not refactored**.
- One debt cleared = one `withdrawals` row = one B2C call = one notification (current behavior).
- Penalty stays → `company_earnings` (Phase 1 rule, unchanged).
- Current open cycle is not bundled into the B2C.

### What changes
Add a deficit-settlement branch in `b2c-callback/index.ts` that fires two SMS — one to payer, one to recipient — only after Safaricom returns `ResultCode === 0`.

### Technical design

**A. Tag deficit-settlement withdrawals so the callback can recognize them**

In `contributions-crud/index.ts` (the existing block ~lines 322–342 that inserts the deficit withdrawal), add a `metadata` JSONB column with structured context:

```ts
metadata: {
  kind: 'chama_debt_settlement',
  debt_id: debt.id,
  deficit_id: deficitRecord.id,
  cycle_number: cycleNum,
  cycle_id: deficitRecord.cycle_id,
  payer_member_id: memberId,
  payer_chama_id: chamaId,
  principal_amount: principalPay,
}
```

No other change to `settleDebts()`. The existing in-app notification to the recipient ("Deficit Payment Received") remains as-is.

**B. New `metadata` column on `withdrawals` (migration)**

```sql
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_withdrawals_metadata_kind
  ON public.withdrawals ((metadata->>'kind'));
```

Safe additive change. No RLS impact (column inherits existing policies). Backfill not needed; historical rows simply have `{}`.

**C. `b2c-callback/index.ts` — dual SMS branch**

After the existing code marks the withdrawal `completed` and persists the Safaricom receipt:

```text
if (resultCode === 0 && withdrawal.metadata?.kind === 'chama_debt_settlement') {
  guard: if withdrawal already has notes/flag `debt_sms_sent_at` → skip (idempotency)
  fetch payer profile  (chama_members → profiles) via metadata.payer_member_id
  fetch recipient profile (withdrawals.requested_by → profiles)
  fetch chama name (metadata.payer_chama_id → chama.name)
  build sanitized SMS bodies (see D)
  call send-transactional-sms x2 (eventType: 'debt_settled_payer', 'debt_settled_recipient')
  UPDATE withdrawals SET metadata = metadata || jsonb_build_object('debt_sms_sent_at', now())
}
```

The existing "payout completed" SMS path is skipped for rows where `metadata.kind === 'chama_debt_settlement'` so the recipient does not receive both a generic payout SMS and the debt-settled SMS.

**D. SMS templates (added to `supabase/functions/_shared/smsTemplates.ts` if present, otherwise inline in `b2c-callback`)**

Plain GSM-7, no emojis, `Pamojanova:` prefix, all values passed through `sanitizeSmsMessage()`:

```
debtSettledPayer(amount, recipientName, recipientCode, chamaName, cycleNum, mpesaRef):
"Pamojanova: Your late payment of KES {amount} to {recipientName} ({recipientCode}) for "{chamaName}" Cycle #{cycleNum} has been delivered. Mpesa Ref: {mpesaRef}. Asante."

debtSettledRecipient(amount, payerName, payerCode, chamaName, cycleNum, mpesaRef):
"Pamojanova: KES {amount} owed to you from "{chamaName}" Cycle #{cycleNum} has been received from {payerName} ({payerCode}). Mpesa Ref: {mpesaRef}."
```

**E. Idempotency guards**
- `withdrawals.metadata->>'debt_sms_sent_at'` check before dispatch — prevents duplicate SMS if Safaricom retries the callback.
- B2C callback is already idempotent on `payment_reference`; this only adds the SMS guard.

### Files touched
- `supabase/migrations/<ts>_withdrawals_metadata_column.sql` — new
- `supabase/functions/contributions-crud/index.ts` — add `metadata: {...}` to the deficit `withdrawals` INSERT (single insert block, ~6 lines)
- `supabase/functions/b2c-callback/index.ts` — add deficit-settlement SMS branch + skip generic payout SMS for this kind

### Out of scope (Phase 3)
- Aggregating multiple debts per recipient into one B2C
- Folding current open cycle into the same B2C
- End-of-chama wallet sweep
- Reminder cron alignment (12:01 PM / 12:05 PM / 6:15 PM)

### Verification
1. On Chacha test 2, have a late member clear two deficits owed to two different recipients → confirm **two** withdrawals, **two** B2C calls, **two** M-Pesa fees (unchanged), and **four SMS** (one payer + one recipient per transfer).
2. Confirm the recipient does NOT also receive the generic "payout completed" SMS for these rows.
3. Confirm a Safaricom callback retry does not double-send SMS (check `metadata.debt_sms_sent_at`).
4. Confirm penalty rows still land in `company_earnings` (Phase 1 invariant).
