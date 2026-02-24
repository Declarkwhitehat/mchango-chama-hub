

## Fix: Truncate AccountReference and TransactionDesc to Safaricom Limits

### Root Cause
Safaricom's Lipa Na M-Pesa Online (STK Push) API has strict character limits:
- `AccountReference`: maximum **12 characters**
- `TransactionDesc`: maximum **13 characters**

The current code passes campaign titles directly without truncation, causing `ResultCode 17` ("System internal error") when the fields exceed these limits.

### Changes Required

**File: `supabase/functions/mpesa-stk-push/index.ts`** (lines 198-210)

Truncate `AccountReference` to 12 characters and `TransactionDesc` to 13 characters in the STK Push payload:

```text
AccountReference: (body.account_reference || 'Donation').substring(0, 12)
TransactionDesc:  (body.transaction_desc || 'Payment').substring(0, 13)
```

**File: `supabase/functions/mpesa-stk-query/index.ts`** — No changes needed, URLs are correct.

### Technical Detail

```text
Current (causes ResultCode 17):
  AccountReference = "The BB ibechasers"     (18 chars, max 12)
  TransactionDesc  = "Donation to The BB..." (29 chars, max 13)

After fix:
  AccountReference = "The BB ibech"          (12 chars)
  TransactionDesc  = "Donation to T"         (13 chars)

All API URLs already match Safaricom production:
  OAuth:    https://api.safaricom.co.ke/oauth/v1/generate           ✓
  STK Push: https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest ✓
  STK Query: https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query    ✓
```

This is a single-line fix in the payload construction. No other files need changes.

