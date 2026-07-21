## Goal
Every deposit (online STK or offline C2B) triggers a clean, professional confirmation SMS from sender ID `PAMOJANOVA` that:
- Greets the payer by first name.
- Names the specific group (e.g. `"AMABUKO self help group"`, welfare name, campaign title, organization name).
- Shows amount + M-Pesa receipt.
- For chama payments only: appends a short line if the payer shortpaid the current cycle and/or still carries debt from previous cycles.

Sender ID is already `PAMOJANOVA` via Onfon (no `Pamojanova:` text prefix — that's the standing SMS-hygiene rule). No emojis in SMS.

## Unified message templates

Chama (self-payment):
```
Hi {FirstName}, KES {amount} received for "{ChamaName}". Receipt: {RCPT}.
{outstanding_line?}
STOP 4569*5#
```

Chama (paid on behalf of another member) — sent to payer:
```
Hi {PayerFirstName}, KES {amount} paid for {BeneficiaryFirstName} in "{ChamaName}". Receipt: {RCPT}.
STOP 4569*5#
```
Sent to beneficiary:
```
Hi {BeneficiaryFirstName}, {PayerFirstName} paid KES {amount} toward your contribution in "{ChamaName}". Receipt: {RCPT}.
{outstanding_line?}
STOP 4569*5#
```

Welfare:
```
Hi {FirstName}, KES {amount} received for "{WelfareName}". Receipt: {RCPT}.
STOP 4569*5#
```

Mchango / Organization donation (unchanged tone, already personalized):
```
Thank you {FirstName}! Your donation of KES {amount} to "{Name}" has been received. Sisi tuko pamoja, je wewe?
STOP 4569*5#
```

## Outstanding-dues line (chama only)

Computed for the beneficiary member right after settlement runs. Line only appears when there's something owed:

- Current cycle shortpaid → `You still owe KES {shortfall} for this cycle.`
- Prior missed cycles → `You have KES {debt} in unpaid past contributions.`
- Both → both lines, comma-separated, capped so total SMS ≤ 320 chars.

Data sources (already exist, no schema changes):
- `member_cycle_payments` for the current cycle → `expected_amount - amount_paid` (only if > 0 and cycle not complete).
- `chama_member_debts.total_outstanding` (or sum of unpaid debt rows) for prior-cycle debt.

If neither > 0, omit the line entirely — silent success.

## Files to change (frontend/edge only, no schema)

1. `supabase/functions/_shared/paymentSmsTemplates.ts` (new)
   - `formatChamaPaymentSms({firstName, chamaName, amount, receipt, shortfall, priorDebt})`
   - `formatChamaOnBehalfPayerSms(...)` / `formatChamaOnBehalfBeneficiarySms(...)`
   - `formatWelfarePaymentSms(...)`
   - `formatMchangoThankYouSms(...)` / `formatOrgThankYouSms(...)`
   - All strings plain GSM-7, no `Pamojanova:` prefix, always end with `\nSTOP 4569*5#`.

2. `supabase/functions/_shared/chamaOutstanding.ts` (new)
   - `getMemberOutstanding(supabaseAdmin, memberId)` → `{ shortfall, priorDebt }` using the two queries above. Fails soft (returns zeros on error) so SMS never blocks.

3. `supabase/functions/payment-stk-callback/index.ts`
   - Chama self-payment branch (~line 338): call outstanding helper for the beneficiary member, use `formatChamaPaymentSms`. Fetch first name from `beneficiaryProfile.full_name`.
   - Pay-on-behalf branch (~lines 294–326): use payer/beneficiary formatters; only the beneficiary SMS carries the outstanding-dues line.
   - Welfare confirmation SMS in this file (if present): switch to `formatWelfarePaymentSms`.
   - Mchango / org branches (~640, ~830): switch to `formatMchangoThankYouSms` / `formatOrgThankYouSms` (keeps existing wording, standardized).

4. `supabase/functions/c2b-confirm-payment/index.ts`
   - Line 241 payer SMS: fetch payer profile first name (from `chamaMemberData.user_id`'s profile) and compute outstanding for that member, use `formatChamaPaymentSms`.
   - Line 261 on-behalf beneficiary SMS: use `formatChamaOnBehalfBeneficiarySms` with outstanding line.

5. `supabase/functions/welfare-contributions/index.ts`
   - Line 262 SMS: switch to `formatWelfarePaymentSms` (already has first name + welfare name; standardize wording via the shared template).

6. `src/utils/smsService.ts` (frontend template constants)
   - Update `paymentReceived`, add `chamaPaymentReceived({firstName, chamaName, amount, receipt, shortfall, priorDebt})` and `welfarePaymentReceived(...)` to keep client-side previews in sync with the edge-function copy. No behavioral change (edge functions are the actual senders); this keeps the two sources aligned.

## Non-goals / preserved rules

- Payment thresholds and cost policy unchanged: still only payer + beneficiary receive SMS on a chama/welfare payment; other members get push only. Mchango thank-you still gated at ≥ KES 50.
- No changes to receipt/idempotency, ledger, commission, or settlement logic.
- No schema migrations.
- No emojis in SMS; no `Pamojanova:` text prefix (sender ID already identifies the source).
- Character budget: aim ≤ 320 chars (2-part SMS worst case) even with both outstanding lines; templates trim decimals to whole KES where safe.

## Verification

- Deploy edge functions.
- Trigger a real chama STK payment on preview → confirm SMS reads `Hi {Name}, KES ... received for "{Chama}". ...`.
- Manually set a `chama_member_debts.total_outstanding` on a test member and pay a partial amount → confirm outstanding line appears with both shortfall and prior-debt.
- Trigger a welfare STK → confirm welfare template.
- Trigger a C2B (Paybill) payment → confirm same personalized copy path.
- Confirm no SMS is sent to non-payer chama members.
