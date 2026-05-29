---
name: Chama Late Payment Formula
description: Late chama payments are 110% of base — split into 10% penalty + 5% commission to platform, 95% net to pool, with FIFO B2C top-up for shortchanged beneficiaries
type: feature
---
For base contribution `C` paid LATE:
- Member pays `C * 1.10` (gross_due)
- `C * 0.10` → `company_earnings` category `chama_late_penalty`
- `C * 0.05` → `company_earnings` category `chama_commission`
- `C * 0.95` → chama pool OR FIFO-routed to shortchanged previous beneficiary

On-time payments unchanged (5% deductive, member pays face value).

Shortfall settlement:
- Table `chama_payout_shortfalls` (UNIQUE on cycle_id) tracks per-cycle deficits when a payout's pool < expected.
- `claim_chama_shortfall_for_settlement(chama_id, amount)` SECURITY DEFINER picks oldest pending row with `FOR UPDATE SKIP LOCKED` and atomically reserves up to `min(outstanding, amount)`.
- On late payment landing, that reserved amount is sent via B2C top-up directly to the beneficiary; remainder flows to chama pool.

Frontend single source: `src/utils/commissionCalculator.ts` → `calculateLatePayment(C)` returns `{grossDue, penalty, commission, netToPool}`. `calculateAmountToPay` now returns `latePenalty` separately; `totalPayable` for late cycles is `lateBase * 1.10`.

Out of scope: frozen-member logic, deadlines, payout schedule unchanged.
