## Fix "Total Collected" card on welfare dashboard

Earlier I changed the "Total Collected" card to show the Net figure (gross − commission), which is why it now reads KES 3,659 instead of KES 4,030.

Revert that card so it shows the **Gross** total, matching the "Total Gross" line in the PDF report.

### Change (single file)

`src/pages/WelfareDetail.tsx`, Financial Overview section:

- Label: back to **"Total Collected"**
- Value: `welfare.total_gross_collected` (i.e. 4,030)

Leave the other two cards unchanged:
- **Commission Paid** → `total_commission_paid` (371)
- **Available Balance** → `available_balance` (3,659 = net − withdrawals)

### Result

Dashboard will read:
- Total Collected: KES 4,030
- Commission Paid: KES 371
- Available Balance: KES 3,659

This matches the PDF's Total Gross / Total Commission / Total Net (credited to balance).

No backend / data changes — the welfare aggregates recomputed last turn are already correct.
