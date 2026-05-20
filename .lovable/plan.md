## Goal
UI/text-only changes — no business logic changes. Cycle still actually closes at 22:00 EAT; only the displayed deadline and a couple of labels change.

## Changes

### 1. Payout label — "Receiving Now" → "Receiving Today"
- `src/pages/ChamaDetail.tsx` line 1129: badge text `Receiving Now` → `Receiving Today`.

### 2. "Pay for another member" auto-pulls selected member's dues
- `src/components/ChamaPaymentForm.tsx`:
  - When `paymentType === "other"` and `targetMemberId` changes, query that member's outstanding (current cycle unpaid balance + missed cycles) and their wallet credit, then:
    - Recompute `requiredAmount` from the target's net-still-needed instead of the logged-in user's.
    - Show a small panel: target member's name, member code, what they have paid this cycle, and "He/She should pay: KES X" (or "Already fully paid" when nothing is due).
  - When switching back to `self`, restore current-user figures.
  - Phone number stays the payer's (logged-in user) — they're paying on the other person's behalf.

### 3. Show deadline as "8:00 PM" everywhere (Kenya time), drop "EAT" suffix
No backend cron timing changes — only the displayed strings.

- `supabase/functions/daily-reminder-cron/index.ts`:
  - Replace the `dueTime` formatted from `cycle.end_date` with a fixed `"8:00 PM"` passed into `NotificationTemplates.paymentReminder`.
  - SMS template lines 165–166:
    - `Final reminder: deadline 22:00 EAT today.` → `Final reminder: pay before 8:00 PM today (Kenya time).`
    - `Deadline: 22:00 EAT today.` → `Deadline: 8:00 PM today (Kenya time).`
- `supabase/functions/chama-grace-reminders/index.ts`:
  - Push message: `due by 10:00 PM Kenya time today` → `due by 8:00 PM today (Kenya time)`.
  - SMS message: `due by 10PM today` → `due by 8:00 PM today`.
- `supabase/functions/chama-start/index.ts` (line 312) and `supabase/functions/chama-start-new-cycle/index.ts` (line 479):
  - In the start-of-chama / new-cycle SMS, replace `10:00 PM EAT` / `10:00 PM` deadline references with `8:00 PM (Kenya time)`. Payout time text stays as-is (payout still happens at 22:00 EAT).
- UI badges/labels:
  - `src/components/chama/PaymentCountdownTimer.tsx` line 215: `10:00 PM Cutoff` → `8:00 PM Cutoff`.
  - `src/components/chama/PaymentCountdownTimer.tsx` line 276: `Payments after 10:00 PM will be marked as LATE…` → `Payments after 8:00 PM will be marked as LATE…`.
  - `src/components/chama/PaymentStatusManager.tsx` line 520: `10:00 PM the next day (Kenya time)` → `8:00 PM the next day (Kenya time)`.
  - `src/components/chama/PaymentStatusManager.tsx` line 596: `10:00 PM Cutoff` → `8:00 PM Cutoff`.
  - `src/components/MemberDashboard.tsx` line 228: `10:00 PM Kenya time the next day` → `8:00 PM the next day (Kenya time)`.
  - `src/components/chama/PreStartDashboard.tsx` line 183: `10:00 PM the next day` → `8:00 PM the next day`.

## Out of scope (intentionally not changed)
- The actual cycle close / payout time stays at 22:00 EAT. No DB, cron schedule, commission cutoff, or `chamaDeadlines.ts` helper changes.
- No new memory rules added — this is a wording adjustment only.

## Deploy
After edits, redeploy `daily-reminder-cron`, `chama-grace-reminders`, `chama-start`, and `chama-start-new-cycle`.