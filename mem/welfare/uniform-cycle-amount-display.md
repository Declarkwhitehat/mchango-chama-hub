---
name: Uniform Cycle Amount Display
description: Welfare cycle UI always shows the full set cycle amount for every member; overpayment counts as extra shares
type: feature
---
When a welfare cycle amount is set (e.g. KES 300), every member is shown as required to pay that FULL amount for the cycle — never a reduced/carried-over figure.

- Required Amount = `welfare_contribution_cycles.amount` for all members alike.
- Payments are counted per cycle (contributions created on/after the cycle start date).
- Paying more than the cycle amount is displayed as "extra shares" (`+KES X extra shares`), not as a credit reducing the next requirement.
- Underpaid members show `paid / required` (e.g. 160 / 300); unpaid members show the full amount to pay.
