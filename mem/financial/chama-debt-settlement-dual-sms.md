---
name: Chama Debt Settlement Dual SMS
description: Per-debt B2C disbursement (one withdrawal per cleared deficit) tagged with metadata.kind='chama_debt_settlement' so b2c-callback fires payer+recipient SMS on Safaricom success.
type: feature
---
**Disbursement** (`contributions-crud/index.ts` `settleDebts`): for each FIFO-cleared deficit principal, create one `withdrawals` row + one `b2c-payout` call. Tag the insert with:
```
metadata: { kind: 'chama_debt_settlement', debt_id, deficit_id, cycle_number, cycle_id, payer_member_id, payer_chama_id, principal_amount }
```

**Dual SMS** (`b2c-callback/index.ts`): on `ResultCode === 0` and `metadata.kind === 'chama_debt_settlement'`:
- Skip the generic "Withdrawal successful" recipient SMS.
- Lookup payer (via metadata.payer_member_id → chama_members → profiles) and recipient (withdrawals.requested_by → profiles).
- Send `Pamojanova:` prefixed plain GSM-7 SMS to both (no emojis).
- Idempotency: gate on `metadata.debt_sms_sent_at`; stamp it after successful dispatch via `metadata` merge.

Penalty still routes to `company_earnings` (Phase 1). Current open cycle is NOT bundled into the B2C — separate transfer. Multiple debts to same recipient = multiple B2C calls and M-Pesa fees (intentional, per user decision).
