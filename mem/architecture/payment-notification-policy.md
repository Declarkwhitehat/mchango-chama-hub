---
name: Payment Notification Cost Policy
description: SMS only to payer/beneficiary on payments; push for everyone else; reminder SMS includes Paybill + Member ID
type: preference
---
On a chama/welfare/mchango contribution, SMS is sent ONLY to the payer (and beneficiary if paying on behalf). All other group members receive push + in-app notifications (free). Never broadcast SMS to all members on a single payment — too costly.

Daily reminder SMS to unpaid members MUST include: first name, amount due, chama name, Paybill 4015351, Account = member_code, so they can pay offline. Template lives in `daily-reminder-cron`.
