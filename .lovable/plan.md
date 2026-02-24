

## Test Simulation: Chama Automatic Payout for 4 Members

Here are the simulated results for each person based on the current `daily-payout-cron` logic:

---

### Setup Assumptions
- Chama: "Test Group", contribution = KES 5,000, frequency = daily, commission = 5%
- Members A (order 1), B (order 2), C (order 3), D (order 4)
- Each cycle, all 4 members owe KES 5,000

---

### Person A — Clean record, it's their payout day

**Eligibility check:** 0 unpaid cycles, 0 missed payments, no admin verification flag

**Result: PAYOUT PROCESSED**
- `canAutoApprove = true` (M-Pesa, 0 missed, no admin flag)
- Assuming all 4 paid: gross = KES 20,000
- Commission (5% on-time): KES 1,000
- Net payout: **KES 19,000** sent via M-Pesa B2C immediately
- SMS: "Your chama payout of KES 19,000 has been processed. Full payout — all members contributed!"
- Withdrawal status: `approved` (auto)

---

### Person B — 1 missed payment, it's their payout day (day 2)

**Eligibility check:** 1 unpaid cycle found → `isEligible = false`

**Result: PAYOUT POSTPONED (moved to end of queue)**
1. `payout_skips` record created with reason: "1 unpaid cycle(s), shortfall KES 5,000"
2. `order_index` updated from position 2 → position 5 (last + 1)
3. `payout_deferred_count` incremented: 0 → 1
4. `was_skipped = true`, `contribution_status = 'skipped'`
5. `resequence_member_order` called — remaining members (C, D) shift up
6. Audit log: `PAYOUT_DEFERRED` with old/new positions
7. SMS: "Your payout was POSTPONED. 1 unpaid cycle(s). Moved to position 5."
8. In-app notification: "Payout Postponed" warning

**Additionally (missed payment consequences):**
- `missed_payments_count` updated: 0 → 1
- `requires_admin_verification = true`
- Debt accrued: KES 5,000 principal + KES 500 penalty (10%)
- SMS warning: "You missed a payment. Pay immediately to avoid penalties."

**System then searches for next eligible member** starting from position 3. If C or D is eligible, they receive the payout instead.

---

### Person C — 3rd missed payment (not their payout day, but consequences apply)

**Result: AUTO-REMOVED FROM GROUP**
1. `missed_payments_count` updated: 2 → 3
2. Status changed to `removed`
3. `chama_member_removals` record created with reason: "Auto-removed: 3 consecutive missed payments"
4. Debt accrued: KES 5,000 principal + KES 500 penalty
5. SMS: "You have been removed from the group after 3 consecutive missed payments. Outstanding: KES 15,000."
6. In-app notification: "Removed from Chama"
7. If C was a manager → auto-reassignment to next eligible member with 0 missed payments
8. `resequence_member_order` called — remaining members reindexed
9. `calculate_expected_contributions` recalculated

---

### Person D — Everything right, clean record

**Result: ELIGIBLE, NO ACTION NEEDED (unless redirected)**
- All cycles fully paid, 0 missed payments
- If it's not D's payout day: nothing happens, D simply continues as normal
- If B was skipped and D is the next eligible member after position 2: **D receives B's redirected payout**
  - Withdrawal created with note: "Redirected payout (B's code skipped)"
  - Payout type: `partial` (marked as redirected)
  - Same M-Pesa auto-approval logic applies

---

### Summary Table

```text
Member | Payout Day? | Missed | Outcome              | Position Change
-------|-------------|--------|----------------------|----------------
A      | Yes         | 0      | PAID KES 19,000      | Stays at 1
B      | Yes         | 1      | POSTPONED            | 2 → 5 (end)
C      | No          | 3      | AUTO-REMOVED         | Removed entirely
D      | No          | 0      | May receive B's pay  | Shifts up
```

### Post-Resequencing Order
After B is moved and C is removed:
```text
Position 1: A (unchanged)
Position 2: D (was 4, shifted up)
Position 3: B (deferred to end)
```

### Key Observations
1. The reordering logic works — B is not permanently skipped, just postponed to last
2. C hits the 3-miss threshold and is automatically ejected
3. D benefits from the resequencing (moves up in queue)
4. All actions have SMS notifications, audit logs, and in-app notifications
5. Debt + deficit records are created for every non-payer regardless of payout outcome

