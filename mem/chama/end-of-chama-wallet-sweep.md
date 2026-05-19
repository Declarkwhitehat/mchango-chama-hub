---
name: End-of-Chama Wallet Sweep
description: When a chama hits cycle_complete, chama-wallet-sweep drains chama_overpayment_wallet per member. Balance >KES 10 with mpesa default → floor to KES, B2C; else entire balance → company_earnings. Idempotent via status='swept'.
type: feature
---
**Trigger**: `cycle-auto-create` invokes `chama-wallet-sweep` (POST `{chamaId}`, service-role bearer) at the same branch where it flips chama → `cycle_complete`. Fire-and-forget.

**Per-member rule**:
- Sum all `chama_overpayment_wallet` rows where `chama_id=X AND member_id=M AND status='pending'`.
- If `balance > 10` AND member has default mpesa `payment_methods` row:
  - `floor_kes = Math.floor(balance)`; sub-shilling → `company_earnings` (source=`chama_wallet_subshilling`).
  - `fee = getMpesaTransactionFee(floor_kes)`; `net = floor_kes - fee.transactionFee`.
  - Insert `withdrawals` (status=`approved`, reviewed_at=now, `metadata.kind='chama_wallet_sweep'`, source_wallet_ids), call `b2c-payout`.
  - B2C callback later records `fee.companyRevenue` as `mpesa_b2c_revenue` (existing path).
  - SMS member immediately: "Your final wallet balance of KES {net} is being sent...".
- Else (`balance <= 10` OR no mpesa): full balance → `company_earnings` (source=`chama_wallet_forfeit`); SMS: "absorbed by the platform".

**Idempotency**: every processed wallet row is flipped to `status='swept'` with `applied_at=now()`. Re-invocation finds nothing pending and exits with `swept: 0`.

**Auth**: function checks `Authorization: Bearer <SERVICE_ROLE_KEY>` only — rejects all other callers with 403.
