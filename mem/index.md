# Project Memory

## Core
- Native Android APK (Capacitor) + Lovable Cloud Backend. PWA removed.
- Safaricom STK/C2B only. Deadlines strictly 22:00 EAT (UTC+3).
- Deductive commission: Net = Gross - Commission. Never modify gross payments.
- Auth: 5-digit PIN, SMS OTP for resets. `check_signup_uniqueness` for unauth.
- Financial Idempotency: Centralized settlement engine, strict FIFO, unique M-Pesa receipts.
- Deno Edge Functions: No catch type annotations. Never use 'mpesa' in payment function names.
- Sequential Member IDs (e.g., DOCTM0001) are immutable and auto-generated via DB.
- Scalability: UI capped at 50 records. `Promise.allSettled()` for parallel queries.
- Admin roles: only `super_admin` can create/revoke admins; all privilege-code-gated pages + edge functions are super_admin only.

## Memories
### Architecture & Backend
- [SMS Sanitization Policy](mem://architecture/sms-message-sanitization-policy) — Strip emojis/non-GSM-7 chars from all SMS; no emojis in SMS templates
- [Chama Engine Spec](mem://architecture/chama-engine-specification) — Strict entry filter, daily cron, debt/deficit logic, FIFO settlement
- [Settlement Engine](mem://architecture/chama-financial-settlement-engine) — Centralized engine, strict FIFO, delegate callbacks
- [Idempotency & Hardening](mem://architecture/financial-idempotency-and-hardening) — UNIQUE indexes, settlement_locks table
- [C2B Callback Idempotency](mem://architecture/c2b-callback-idempotency) — claim_c2b_callback + c2b_callback_claims; duplicates replay cached result
- [B2C Withdrawal Logic](mem://architecture/b2c-withdrawal-logic) — Atomic completion, 1-hour processing lock
- [Edge Function Auth Pattern](mem://architecture/edge-function-auth-pattern) — `verify_jwt = false`, supabaseAdmin bypass
- [Edge Invocation Standard](mem://architecture/edge-function-invocation-standard) — Use POST with body ID instead of GET path params
- [Edge Function Deno Syntax](mem://architecture/edge-function-deno-compatibility) — Explicit error casting, no catch type annotations
- [Edge Function Naming](mem://architecture/edge-function-naming-convention) — No 'mpesa' in payment function names
- [Auth Lock Prevention](mem://architecture/auth-lock-prevention) — Preventing Navigator LockManager deadlocks in AuthContext
- [Database Pagination](mem://architecture/database-performance-and-pagination) — Limit 20-100, composite indexing, avoid SELECT *
- [UI Resilience Patterns](mem://architecture/ui-resilience-patterns) — Promise.allSettled() for parallel data fetching
- [UI Error Transparency](mem://architecture/ui-error-transparency-pattern) — Direct fetch with auth headers to expose JSON errors
- [PWA Native Distribution](mem://architecture/pwa-native-distribution-strategy) — Capacitor APK, remote server URL, SW removal
- [Frontend Performance](mem://architecture/frontend-performance-and-caching-standard) — React Query aggressive defaults, 50-record limit
- [Chama Deadline Timezone](mem://architecture/chama-deadline-timezone-standard) — 22:00 EAT (UTC+3) strictly enforced
- [Cycle-End Manager Notifications](mem://architecture/cycle-end-manager-notifications) — SMS summary at cycle close: all-paid or missed list
- [Withdrawals Profile Link](mem://architecture/withdrawals-to-profiles-link) — Foreign key enables PostgREST embedded joins
- [Welfare Deduction Timing](mem://architecture/welfare-balance-deduction-timing) — Deduct on dual approval, refund on cancel
- [Document Serial Retrieval](mem://architecture/document-serial-and-retrieval-policy) — Numeric serials, QR codes, 1-month retention
- [External Migration](mem://constraints/external-migration) — Unsupported due to auth hashes & callback config

### Payments & Financial
- [Paybill 4015351 Config](mem://payments/paybill-4015351-config-standard) — ShortCode=PartyB=4015351, CustomerPayBillOnline
- [Paybill Account IDs](mem://payments/paybill-account-id-standards) — Hide if <= 6 chars, BillRefNumber matching, deduplicate
- [STK Push Till Logic](mem://architecture/payment-stk-push-till-logic) — BusinessShortCode & PartyB must match Till Number
- [Safaricom STK Limits](mem://architecture/safaricom-stk-push-limits) — AccountRef <= 12 chars, TransDesc <= 13 chars
- [Ledger Standards](mem://financial/ledger-and-balance-standards) — Deductive commission, Net = Gross - Commission
- [Payment Compliance](mem://financial/payment-compliance-standard) — Compliance based on gross payment amount
- [Offline Tracking Standard](mem://financial/offline-payment-tracking-standard) — Store actual_payment_date for cycle allocation
- [C2B Account Matching](mem://financial/c2b-account-matching-priority) — Match BillRefNumber to member_code
- [Welfare Withdrawal Verification](mem://financial/welfare-withdrawal-verification-standard) — Require Member ID, resolve server-side
- [Overpayment Wallet](mem://financial/chama-overpayment-wallet) — Extract 5% commission, net applied to next cycle
- [Transaction Hygiene](mem://payments/transaction-history-hygiene) — Deduplicate pending STK records upon confirmation
- [Payout Approval Guard](mem://financial/payout-approval-request-guard) — Suppress KES 0 admin approval requests

### Chama Features
- [Twice-weekly First Cycle Anchor](mem://chama/twice-weekly-first-cycle-anchor) — Cycle 1 always closes on the first chosen weekday; manager start preview + confirm dialog
- [Grace Period Reminders](mem://chama/grace-period-reminders) — Push 10h + SMS 6h before first-cycle 10PM deadline; payment UI hidden for `pending` chamas
- [Automated Governance](mem://chama/automated-governance-and-payout-logic) — Auto-completion, daily cron, auto-removal
- [Activation Sequence](mem://features/chama-activation-sequence) — Join, Start, Contribution phases and Fisher-Yates shuffling
- [First Payment Guard](mem://chama/first-payment-activation-guard) — Order re-assignment strictly for pending chamas
- [Activation Grace Period](mem://chama/activation-grace-period) — First payment due by 10:00 PM next day
- [Lifecycle & Completion](mem://chama/lifecycle-and-completion-policy) — Bounded to active member count, unified rejoin summary
- [Restart & Reshuffling](mem://features/chama-cycle-restart-with-reshuffling) — Chama lifecycle auto-cleanup, reshuffling
- [Manager Auto-Succession](mem://chama/manager-auto-succession-policy) — Auto-promotes highest score active member
- [Payout Scheduling](mem://chama/payout-scheduling-logic) — Anchored to start_date, handles deferred turns
- [Cycle Collision Avoidance](mem://chama/cycle-collision-avoidance) — Strict date-range checks for unique active cycles
- [Member Auto-Removal](mem://chama/member-auto-removal-logic) — Day-1 first-cycle only; otherwise see freeze policy
- [Member Freeze Policy](mem://chama/member-freeze-policy) — 3 misses → frozen; auto-unfreeze on dues + 10% fee
- [Custom Frequencies](mem://chama/custom-contribution-frequencies) — specific day-of-month (1-28) cycle boundaries
- [Member ID Persistence](mem://chama/member-id-persistence-policy) — Payout positions immutable once started
- [Invitation Link Policy](mem://chama/invitation-link-policy) — 1 active link, multi-use tracking
- [Group Chat](mem://features/chama-group-chat) — Private realtime chat with 7-day auto-delete cron

### Welfare Features
- [System Spec](mem://features/welfare-system-specification) — 3-person multi-sig withdrawal, cooling-off period
- [Contribution Cycle Logic](mem://welfare/contribution-cycle-logic) — 1 active cycle, pre-filled amounts, persistent alerts
- [Governance & Exit Policy](mem://welfare/governance-and-exit-policy) — Chairman blocked from leaving; Admins can override
- [Executive Change Security](mem://welfare/executive-change-security-protocol) — 72/96h withdrawal cooldown on role change
- [Member Rejoin & ID](mem://welfare/member-rejoin-and-id-persistence) — Original M0001 ID retained upon rejoining
- [Payment Lookup Feature](mem://welfare/payment-lookup-feature) — Search contributions by Name/Member ID
- [Registration Fee Policy](mem://welfare/registration-fee-policy) — Optional fee, dual-approval, 5-day deadline, partial credit ledger, daily SMS+push reminders

### Platform Features & Infrastructure
- [Safaricom Payout Workflow](mem://features/safaricom-payout-lockdown-and-change-workflow) — M-Pesa primary payout read-only logic
- [Verification Protocol](mem://business-rules/verification-protocol-and-fees) — Dynamic fee deducted/refunded via company_earnings
- [Offline Donor Attribution](mem://features/offline-payment-donor-attribution) — Auto-extracting real names from M-Pesa callbacks
- [Member Trust Score](mem://features/member-trust-score-system) — 0-100 score affecting payout queue, decays 5 pts/week
- [Native Push Notifications](mem://features/native-push-notifications) — Capacitor push config and device_tokens RLS
- [Group Document Management](mem://features/group-document-management) — Multi-document storage, max 3MB, restricted deletion
- [Mchango Donor Transparency](mem://mchango/donor-transparency-and-notifications) — Withdrawal alerts, guest amber-alert banners
- [Mchango Guest Flow](mem://mchango/guest-donation-flow-optimization) — Client-side UUIDs, auto-sync user_id trigger
- [Mchango Single Image](mem://mchango/single-image-restriction) — 1 image only
- [SMS Messaging](mem://infrastructure/sms-messaging-provider) — Onfon Media, standardized templates
- [Lovable Cloud Backend](mem://infrastructure/lovable-cloud-backend) — No external DB
- [Primary Domain](mem://infrastructure/primary-domain) — `https://pamojanova.com` root, served by Vercel; www/.online redirect

### Security & Auth
- [Multi-factor Standards](mem://auth/multi-factor-and-security-standards) — Native biometric, fallback device credentials, 2FA
- [App Lock Biometric](mem://auth/app-lock-biometric-architecture) — Soft logout/lock + hard logout, @capacitor/preferences storage
- [Compulsory PIN](mem://security/compulsory-pin-and-recovery-system) — 5-digit PIN enforced post-login with 15-min cooldown
- [Password Reset Architecture](mem://auth/password-reset-architecture) — SMS OTP only, server-side lookup via service role
- [Signup Uniqueness](mem://auth/signup-uniqueness-validation) — Use `check_signup_uniqueness` RPC
- [Registration Phone Formatting](mem://auth/registration-phone-formatting) — Auto-transform 07, 01, 7, 1 into +254
- [Fraud & Audit System](mem://security/fraud-and-audit-system) — Risk scoring 0-100, immutable ledgers, auto-flagging 81+
- [Unique Naming Policy](mem://security/unique-naming-policy) — Case-insensitive unique names for all groups
- [Chama Profile Visibility](mem://security/chama-member-profile-visibility-policy) — Managers see pending members
- [Welfare Profile Visibility](mem://security/welfare-member-profile-visibility-policy) — RLS allows shared active welfare members to see profiles
- [Entity Creator Visibility](mem://security/entity-creator-visibility-policy) — Creators always see their own records

### Admin
- [Oversight Controls](mem://admin/oversight-and-privilege-controls) — Privilege code, active metrics, document deletion
- [Dashboard Architecture](mem://admin/dashboard-architecture) — High-density, 30s auto-refresh, redundant stats suppressed
- [Withdrawal Management](mem://admin/withdrawal-management-oversight) — Multi-sig tracking, Force Approve, B2C retry
- [Unified Transaction View](mem://admin/unified-transaction-view) — Chronological feed from all contribution tables
- [Member Activity Dashboard](mem://admin/member-activity-dashboard) — Cross-entity audit trail and KYC views
- [User 2FA Reset](mem://admin/user-2fa-reset-feature) — Delete from 'totp_secrets' table
- [Super Admin & Monitoring](mem://security/super-admin-role-and-monitoring) — super_admin role, gated surfaces, admin_action_log

### UI & Styling
- [Tabbed Detail Layout](mem://ui/tabbed-detail-layout-preference) — Grid-based, non-scrolling tabs, bold labels
- [Collapsible Sections](mem://ui/collapsible-sections-preference) — Long lists and secondary panels collapsed by default
- [Chama Detail Layout](mem://ui/chama-detail-simplified-layout) — Compact 4-area dashboard suppressing redundant tabs
- [Chama Complete UI Logic](mem://features/chama-cycle-complete-ui-logic) — Suppressing active elements and relabeling
- [Offline Payment Card](mem://ui/offline-payment-instruction-card) — Unified Paybill 4015351 component with copy buttons
- [Financial Breakdown Labels](mem://ui/financial-breakdown-labels) — "Available Balance" for admins, "Net After Commission"
- [Chama Payment Timer](mem://ui/chama-payment-timer-consolidation) — Consolidates current cycle and debts to totalPayable
- [Skipped Member Alert](mem://ui/chama-skipped-member-alert-logic) — Alert states for deferred members clearing dues
- [Floating Triggers Layout](mem://ui/floating-triggers-layout) — FAB bottom-left, Chat bottom-right
- [Group Joining Entry Points](mem://ui/group-joining-entry-points) — "Join by Code" at top of listings
- [Member Payment Filter](mem://ui/member-payment-selection-filter) — "Pay for another" excludes removed/pending members
- [Welfare Access & Reporting](mem://ui/welfare-access-and-reporting) — Member success bars, Check Payments tool, PDF export
- [Creator Branding Policy](mem://ui/creator-branding-policy) — No "Created by" on public pages
- [Version Indicator](mem://ui/version-indicator-standard) — Build timestamp in footer for native app sync check
- [Performance Asset Optimization](mem://style/performance-asset-optimization) — JPEGs, avatars 80x80
- [Homepage Tagline](mem://style/homepage-tagline) — Static "sisi tuko pamoja je wewe?"

### Identity & SEO
- [Sequential Member ID](mem://identity/sequential-member-id-standard) — GroupCode + SeqNumber (e.g. DOCTM0001)
- [Platform Branding](mem://identity/platform-branding-and-leadership) — PAMOJA NOVA, CEO Declark Okemwa Chacha
- [SEO & Content Strategy](mem://marketing/seo-and-content-strategy) — JSON-LD, specific keywords, Edge Function sitemap
