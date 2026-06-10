---
name: Outstanding Amount Deduplication
description: get_member_live_outstanding excludes unpaid cycles already tracked as debt to prevent double-counting
type: feature
---
When a cycle closes unpaid, a row exists in both `member_cycle_payments` (amount_due unpaid) AND `chama_member_debts` (principal_remaining + penalty_remaining). The RPC `get_member_live_outstanding` subtracts `principal_remaining` per cycle from the unpaid-cycles sum so the member is not charged twice for the same missed contribution.

UI: `AmountToPayCard` receives `currentCycleDue={isActive}` from `ChamaDetail` so that once chama status is `cycle_complete`, no "current cycle" amount is added to the total — only outstanding debts remain payable.
