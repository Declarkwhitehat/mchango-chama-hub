## Goal

Make every important event in the app trigger a **short, professional, direct** notification (in-app + push + SMS) — no emojis, no fluff, no generic "Welcome!" tone. Cover both transactional events for the user and critical alerts for admins.

The current `NotificationTemplates` are wordy and emoji-heavy ("Withdrawal Approved! 💰", "Welcome!", "Check your M-Pesa!"), several key events fire no notification at all (creating a chama / welfare / organization / campaign), and admins are never alerted to failed payouts or pending verifications.

## Style rules (applied everywhere)

- Brand prefix on every SMS: `Pamojanova:` then a single sentence.
- No emojis anywhere (matches existing SMS Sanitization Policy and keeps in-app titles consistent).
- Format: `<Action> — <amount/entity> — <key fact>`. Examples:
  - `Withdrawal sent. KES 5,000 to 0712***456. Ref QFX12ABC.`
  - `Chama "Bidii" created. Code BID12. Share with members to invite.`
  - `Verification submitted for campaign "Build School". Admin will review within 24h.`
- Titles ≤ 40 chars, messages ≤ 160 chars (single SMS segment).
- Always include the M-Pesa receipt / amount / entity name when relevant.

## Changes

### 1. Rewrite `supabase/functions/_shared/notifications.ts`

Replace every entry in `NotificationTemplates` with a tight, emoji-free version. Add the missing transactional templates:

- `chamaCreated(name, code)`
- `welfareCreated(name, code)`
- `organizationCreated(name)`
- `campaignCreated(name, targetAmount)`
- `withdrawalCompletedDetailed(amount, phoneMasked, mpesaRef)` (replaces the current vague "Check your M-Pesa")
- `donationSent(amount, campaignName, mpesaRef)` — confirmation to the donor
- Admin-only:
  - `adminPayoutFailed(amount, recipient, reason)`
  - `adminLargeWithdrawal(amount, entityName, threshold)`
  - `adminVerificationPending(entityType, entityName, requestedBy)`

### 2. Wire missing trigger points

| Event | File to edit | Notify |
|---|---|---|
| Chama created | `supabase/functions/chamas-crud/index.ts` | Creator (in-app + push + SMS) |
| Welfare created | `supabase/functions/welfares-crud/index.ts` | Creator |
| Organization created | `supabase/functions/organizations-crud/index.ts` | Creator |
| Campaign created | `supabase/functions/mchango-crud/index.ts` | Creator |
| Verification submitted | `supabase/functions/request-account-verification/index.ts` + `src/components/VerificationRequestButton.tsx` | User (confirmation) + **all admins** |
| B2C payout failed | `supabase/functions/b2c-callback/index.ts` (existing failure branch around line 320) | **All admins** + requester |
| Large withdrawal approved | `supabase/functions/withdrawals-crud/index.ts` (status → approved) | **All admins** when `gross_amount ≥ 50,000` |

### 3. Admin fan-out helper

Add `notifyAllAdmins(adminClient, notification)` to `_shared/notifications.ts`:
- Fetches `user_id`s from `user_roles` where `role = 'admin'`
- Calls `notifyManyUsers(...)` (already exists)
- Caches the admin list for 60 s in module memory to avoid hammering the DB

### 4. SMS for the most critical user events only

Send SMS (via existing `sendSMS` in `_shared/sms.ts`) for:
- Withdrawal completed
- Payment confirmed
- Payout received (chama / welfare disbursement)
- Donation sent (to the donor)
- Verification approved/rejected

Skip SMS for chama/welfare/organization/campaign creation — push + in-app only (saves cost; users see it instantly in the app).

### 5. Admin threshold setting

Read the "large withdrawal" threshold from `platform_settings.setting_key = 'admin_large_withdrawal_threshold'` (default `50000`). One small migration adds the row.

## Out of scope

- No new tables (reuses `notifications`, `device_tokens`, `user_roles`).
- No email — only in-app + push + SMS.
- No changes to the user notification UI / bell — existing realtime subscription already renders new rows.
- No changes to verification fee / payout business logic.

## Verification

- Create a chama → creator gets a push + in-app card "Chama created. Code XXX12. Share to invite."
- Submit a verification request → admins receive "Verification pending: campaign Build School (User Jane Doe)."
- Trigger a B2C failure (or simulate one) → admins receive "Payout failed: KES 1,000 to 0712***456. Reason: …".
- Successful B2C → recipient SMS reads `Pamojanova: Withdrawal sent. KES X to 07XX***XXX. Ref QFX…`.
