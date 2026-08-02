# Welfare Executive Action Banner

Right now, when a chairman, secretary or treasurer needs to approve something in a welfare, the controls are buried: withdrawal approvals sit far down the page (Secretary/Treasurer only) and the registration-fee approval is hidden inside the collapsed Executive Panel. Executives often miss them.

## What to build

A single prominent banner at the top of the welfare page (right below the header, above the existing security banner) that appears only when there is something for the signed-in executive to act on.

The banner shows one row per pending item:

1. **Withdrawal request awaiting your approval** — amount, who requested it, recipient/category. Inline "Approve" and "Reject" buttons (rejection reason optional, revealed when Reject is tapped). Shown to the secretary and treasurer who have not yet decided.
2. **Registration fee change awaiting approval** — current fee vs proposed fee and who requested it. Inline "Approve" button. Shown to executives other than the requester.
3. **Awaiting others** — if the signed-in executive already requested/decided, the banner shows a read-only "Waiting for <role> to approve" line instead of buttons, so the requester still sees progress.

Behaviour:
- Banner is hidden entirely for regular members, and when nothing is pending.
- Amber/attention styling consistent with the existing security banner.
- After acting, the banner refreshes and the page data reloads; a toast confirms the result.
- Each action requires the 5-digit PIN, matching the existing executive-action security rule.

## Technical notes

- New component `src/components/welfare/WelfarePendingActionsBanner.tsx`, rendered in `src/pages/WelfareDetail.tsx` just above `<WelfareExecutiveChangeBanner />`, receiving `welfareId`, `myRole`, and an `onAction` refresh callback.
- Withdrawal items: reuse the existing `welfare-withdrawal-approve` edge function (GET to list pending for the welfare, POST with `approval_id` + `decision`) — same calls `WelfareApprovalCard` already makes.
- Fee change items: read `registration_fee`, `registration_fee_pending`, `registration_fee_change_requested_by` from the welfare record and call `welfare-crud/{id}` PUT with `approve_registration_fee: true`, same as `WelfareExecutivePanel`.
- Wrap both actions in `usePinVerification().requirePin(...)` and mount `<PinEntryDialog />`, matching the existing panel pattern.
- No backend, schema, or business-logic changes — presentation only; the existing `WelfareApprovalCard` and Executive Panel controls stay as-is.
