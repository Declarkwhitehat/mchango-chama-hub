

## Plan: Grace Period, UI Improvements, Commission Model Change, and Chat Auto-Delete

### Summary
Fix grace period enforcement, add collapsible sections, change commission from additive (pay KES 105) to deductive (pay KES 100, 5% deducted = KES 95 to group), and auto-delete chat messages older than 1 week.

---

### 1. Commission Model Change: Additive → Deductive

The current system charges commission ON TOP (member pays KES 105 for a KES 100 contribution). The user wants members to pay exactly KES 100, with 5% deducted from that amount (KES 5 to platform, KES 95 to chama pool).

**Files:**
- `supabase/functions/contributions-crud/index.ts` — Change settlement logic:
  - Current: `grossNeeded = amountDue * (1 + ONTIME_RATE)` → New: `grossNeeded = amountDue` (member pays the base amount)
  - Commission extracted from within: `commission = grossPaid * ONTIME_RATE`, `net = grossPaid - commission`
  - Same for late payments: `commission = grossPaid * LATE_RATE`
- `src/utils/commissionCalculator.ts` — Update `calculateGrossAmount` to return `baseAmount` (no markup), update `calculateCommission` to be deductive
- `supabase/functions/_shared/commissionRates.ts` — No change to rates, just the model
- `src/components/chama/PaymentCountdownTimer.tsx` — Display "Pay KES 100" (base amount), show "5% commission deducted" as info text
- `src/components/chama/AmountToPayCard.tsx` — Update to show deductive breakdown
- `src/components/CommissionDisplay.tsx` — Update labels from "added on top" to "deducted from"

### 2. Grace Period: Enforce Until Next Day 10 PM

Ensure no member is classified as unpaid/missed during the 24-hour grace period.

**Files:**
- `src/components/chama/DailyPaymentStatus.tsx` — Grace period logic already exists; verify `isGracePeriod` flag suppresses all missed/outstanding displays
- `src/components/MemberDashboard.tsx` — Already has grace period check; ensure it covers all warning paths
- `supabase/functions/daily-cycle-manager/index.ts` — In the `all-cycles` action, ensure cycles with `end_date` in the future return status `'pending'` not `'missed'`; also skip auto-advance during grace period
- `supabase/functions/daily-reminder-cron/index.ts` — Ensure reminders are suppressed during the first 24 hours after `chama.start_date`

### 3. UI: Collapsible Dropdowns for Payment Status and Unpaid Members

Replace static "Today's Payment Status" card and "Unpaid Members" section with collapsible/accordion sections using the existing `Collapsible` component.

**File:** `src/components/chama/DailyPaymentStatus.tsx`
- Wrap "Today's Payment Status" (detailed member list, lines 374-448) in a `Collapsible` with a clickable header showing summary (e.g., "4/6 paid") — collapsed by default
- Wrap "Unpaid Members" section (lines 356-368) inside the financial summary in a `Collapsible` — collapsed by default
- Wrap "Per-Cycle Payment History" (lines 258-317) in a `Collapsible` — collapsed by default

### 4. "Time to Pay" Should Show Time Left for Next Payment

**File:** `src/components/chama/PaymentCountdownTimer.tsx`
- Change the header label from "Time to pay" to show "Time left to make your next payment"
- Ensure the countdown counts down to the current cycle's `end_date`

### 5. Group Chat Auto-Delete After 1 Week

**New edge function:** `supabase/functions/cleanup-old-chat-messages/index.ts`
- Delete all `chama_messages` where `created_at < NOW() - 7 days`
- Schedule via pg_cron to run daily

**File:** `src/components/chama/ChamaChatPanel.tsx`
- Add a small info note: "Messages are automatically deleted after 7 days"

---

### Technical Details

- **Commission model change** is the most impactful: it affects the FIFO settlement engine, allocation preview, all display components. The core change is in `contributions-crud/index.ts` where `grossNeeded = amountDue * (1 + rate)` becomes `grossNeeded = amountDue` and commission is extracted as `amountDue * rate` from within.
- **No database migrations needed** for commission or grace period changes.
- **One new edge function** for chat cleanup + a cron job (via insert tool, not migration).
- Files affected: ~8 files modified, 1 new edge function created.

