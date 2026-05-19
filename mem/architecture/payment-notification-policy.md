---
name: Payment Notification Cost Policy
description: SMS only to payer/beneficiary on payments; push for everyone else; mchango/org thank-you SMS includes "Sisi tuko pamoja, je wewe?" signature; mchango campaign SMS gated to >= KES 50
type: preference
---
On a chama/welfare/mchango/organization contribution, SMS is sent ONLY to the payer (and the beneficiary if paying on behalf of another member). All other group members receive push + in-app notifications (free). Never broadcast SMS to all members on a single payment — too costly.

**Mchango campaign donations**: M-Pesa donations (online STK or offline C2B) trigger a branded thank-you SMS to the donor ONLY when `grossAmount >= 50`. Message is professional, warm, and ends with `Sisi tuko pamoja, je wewe?`. Skip SMS below KES 50 to save costs.

**Organization donations**: Always send a thank-you SMS to the donor (no threshold), ending with `Sisi tuko pamoja, je wewe?`.

**Chama / Welfare contributions**: Always send a confirmation SMS to the payer. For C2B chama, if the M-Pesa payer phone differs from the beneficiary's profile phone (last 9 digits), also SMS + in-app notify the beneficiary that someone paid on their behalf.

**SMS hygiene**: No commission/net breakdown in confirmation SMS — keep it short. No `Pamojanova:` prefix (sender ID identifies source). No emojis (GSM-7 safe). See SMS Sanitization Policy.

Daily reminder SMS to unpaid members MUST include: first name, amount due, chama name, Paybill 4015351, Account = member_code, so they can pay offline. Template lives in `daily-reminder-cron`.
