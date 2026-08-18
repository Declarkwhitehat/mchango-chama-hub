---
name: Cycle gap-window payment allocation
description: Payments made between a cycle's 21:00 EAT close and the next cycle's 00:01 EAT open must credit the next open cycle, not the overpayment wallet
type: feature
---
A chama cycle closes at 21:00 EAT and the next opens at 00:01 EAT the following day, leaving a ~3h gap.

Rules:
- Payment settlement (`contributions-crud`, both preview and settle paths) must fall back to the earliest cycle with `payout_processed = false` and `end_date >= now` when no cycle covers "now". These payments are treated as on-time (5%).
- Money in that window must never be parked as a pending overpayment-wallet row, which made the payer look unpaid for the open cycle.
- Reminders (`daily-reminder-cron`) must quote `amount_due - amount_paid` (never the full due) and must only say "today" when the Kenya deadline date equals today; otherwise state the actual deadline date. Never imply a missed payment while the cycle is still open.
