---
name: Chama Auto-Continue Lifecycle (No Rejoin)
description: Chamas auto-continue into a new cycle 24h after cycle_complete with debt-free members; debtors are auto-removed; new members can join active chamas mid-stream and are removed if they miss the first payment.
type: feature
---
**End-of-cycle flow (chama-auto-restart, runs 24h after `cycle_complete`):**
1. Members with no outstanding `chama_member_debts` rows continue automatically — NO rejoin request, NO manager approval.
2. Members with outstanding debts (`status in ('outstanding','partial')`) are auto-removed (`status='removed'`, `removal_reason='unpaid_debt_cycle_end'`) and SMS'd.
3. Continuing members are reshuffled (random order_index), counters reset, chama flips back to `active`, `current_cycle_round += 1`.
4. If fewer than `min_members` are debt-free, the chama stays in `cycle_complete` (waiting for more debtors to clear, no destruction).

**Deprecated:** the 40%-rejoin deletion path in `chama-auto-cleanup` is now a no-op. `chama_rejoin_requests` are still cleared but no longer required.

**Mid-stream joins (chama-join):** Active chamas now accept new joins. New members enter with `status='inactive'` until first payment clears (existing first-payment auto-removal guard handles non-payers). Manager approval is still required.

**SMS at cycle close (chama-cycle-complete):** Debtors get 24h warning; debt-free members are told the chama will auto-continue with no rejoin needed.

**Manager advisory at chama creation:** ChamaCreate page shows an amber alert reminding the manager to only invite people they personally know — pools real money, debtor removals affect reputation.
