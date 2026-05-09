# Chama System Bug Fixes (13 fixes)

Apply the exact code changes you specified, scoped to the named files/functions.

## Files to edit

### `src/components/chama/PaymentStatusManager.tsx`
- **FIX 1**: In `getMemberPaymentStatus()`, add `&& cp.cycle_id === activeCycleId` to the `p !== "today"` fallback `cyclePayments.find(...)`.
- **FIX 2**: In `generatePDF()`, replace `totalCollected` calc to sum from `paidMembersForPdf.reduce((sum, m) => sum + getMemberPaymentStatus(m.id, pdfPeriod).amount, 0)`.
- **FIX 11**: In `fetchData()`, add `.eq("approval_status", "approved")` to members query.
- **FIX 12**: In `fetchData()`, change contributions start date from `startOfMonth(new Date())` to `subDays(new Date(), 7)`. Import `subDays` from `date-fns`.
- **FIX 13**: In `generatePDF()`, replace `doc.save(fileName)` with `await savePdfNative(pdfBlob, fileName)` (import helper as used elsewhere in the app; verify import path during impl).

### `supabase/functions/cycle-auto-create/index.ts`
- **FIX 3a**: In `calculateNextCycleDates()` daily case, replace `endDate.setHours(22, 0, 0, 0)` with `endDate.setUTCHours(19, 0, 0, 0)`.

### `supabase/functions/daily-cycle-manager/index.ts`
- **FIX 3b**: Replace any `setHours(22,0,0,0)` with `setUTCHours(19,0,0,0)`.
- **FIX 7**: In `all-cycles` action, compute `cycleAge`/`isStillNew` and gate `missed` on `!isStillNew` per the snippet.

### `supabase/functions/daily-payout-cron/index.ts`
- **FIX 4**: At top of main cycle-processing loop, skip cycle if `created_at` < 23h old.
- **FIX 5**: At top of `for (const chama of chamas)` loop, skip if within 24h grace period from `start_date || created_at`. Ensure those columns are SELECTed.
- **FIX 6**: Inside Gap Recovery `while` loop, before inserting each gap cycle, `break` if `nextStart` is < 23h old.

### `supabase/functions/c2b-confirm-payment/index.ts`
- **FIX 8**: Replace hardcoded `(15%)` SMS string with `(${(commissionRate * 100).toFixed(0)}%)`.

### `supabase/functions/payment-stk-callback/index.ts`
- **FIX 9**: Move the `notifyManyUsers` broadcast call inside the `if (status === 'completed')` block.

### `supabase/functions/contributions-crud/index.ts`
- **FIX 10**: In `settleDebts()`, remove the `carry_forward_credit` update so `chama_overpayment_wallet` is sole source of truth.

## Verification
- Open each file beforehand to confirm exact context (function signatures, surrounding code) so search/replace lands cleanly.
- After edits, deploy the touched edge functions: `cycle-auto-create`, `daily-cycle-manager`, `daily-payout-cron`, `c2b-confirm-payment`, `payment-stk-callback`, `contributions-crud`.
- No DB migrations, no schema changes, no UI/business-logic changes beyond what's listed.

## Notes / Risks
- For FIX 13, I'll match the existing `savePdfNative` helper pattern used by other PDF downloads (e.g. `ContributionsPDFDownload.tsx`) — same import path and blob-construction style.
- FIX 5 reads `chama.start_date`; if it's null the fallback to `created_at` per your snippet is preserved.
- All financial logic (commission %, settlement order, payout amounts) remains untouched; only timing/filter/display bugs are fixed.
