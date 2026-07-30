---
name: Reminder SMS Disabled
description: All reminder SMS (payment, grace, KYC, welfare registration, campaign expiry) are suppressed; push + in-app only. Confirmations/OTP still send.
type: constraint
---
Reminder SMS are disabled platform-wide. `send-transactional-sms` returns `{ skipped: true, reason: 'reminder_sms_disabled' }` for any eventType matching `remind|reminder|grace_warning|expiry|kyc_reminder`. Direct Onfon reminder sends in `kyc-auto-cleanup` (72h reminder) and `mchango-expiry-reminders` are removed.

Still sent: payment/payout confirmations, OTP, KYC approve/reject, account-removal notice, admin broadcasts.

**Why:** SMS cost control. Reminders go out as push + in-app notifications instead. Do not re-add reminder SMS unless the user explicitly asks.
