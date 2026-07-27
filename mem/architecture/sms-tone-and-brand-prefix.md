---
name: SMS Tone and Brand Prefix Rule
description: SMS must never start with PAMOJANOVA/brand name; reminders must be professional and state the exact due date, amount, Paybill and member ID.
type: constraint
---
**Never** start any SMS with `PAMOJANOVA:` / `Pamojanova:` / any brand prefix — the Onfon sender ID already identifies the source. `send-transactional-sms` sanitizer strips a leading brand prefix as a hard safety net, but templates must not include it in the first place.

**Reminder tone standard** (chama, welfare, registration fees, cycles):
`Hi <FirstName>, your KES <amount> contribution to "<Group>" is due on <date/time>. [Outstanding balance: KES X.] Pay via M-Pesa Paybill 4015351, Account <member_code>, or in the app. Thank you for keeping your group strong.`

Always include: first name, exact amount, group name, explicit due date (EAT, formatted e.g. "5 Aug 2026"), Paybill 4015351, member ID account, and a courteous closing. No emojis, no brand prefix. Shared helper: `formatContributionReminderSms` in `supabase/functions/_shared/paymentSmsTemplates.ts`.
