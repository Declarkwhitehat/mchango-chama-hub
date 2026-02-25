# Offline Payment Reconciliation System - Setup Guide

## Overview
This system allows members of Chamas and Savings Groups to make offline M-Pesa payments using their unique member ID as the account number. Payments are automatically reconciled and credited to member accounts within 1 minute.

---

## System Architecture

### Member ID Format
Each group gets a unique 3-character code (e.g., "ABC", "XYZ"), and members get sequential numbers:
- **Chama Example**: Group "Tech Savers" → Code "ABC" → Members: ABC1, ABC2, ABC3...
- **Savings Group Example**: Group "Dream Team" → Code "XYZ" → Members: XYZ1, XYZ2, XYZ3...

### Payment Flow
1. Member goes to M-Pesa → Lipa na M-Pesa → Buy Goods & Services
2. Enters Till Number (configured by admin)
3. Enters amount to pay
4. Enters their Member ID as the Account Number (e.g., "ABC7")
5. Completes payment with PIN
6. M-Pesa sends callback to our system
7. System identifies the member and group
8. Payment is automatically recorded
9. Member receives SMS confirmation
10. Balance is updated immediately

---

## Prerequisites

### 1. M-Pesa Business Account
You need either:
- **M-Pesa Till Number** (Buy Goods and Services)
- **M-Pesa Paybill Number** (for larger businesses)

To get one:
1. Visit Safaricom M-Pesa office or agent
2. Register for M-Pesa business account
3. Choose "Till Number" for simplicity
4. Receive your till number (e.g., 123456)

### 2. Safaricom Daraja API Access
1. Go to https://developer.safaricom.co.ke/
2. Sign up for a developer account
3. Create an app (Production or Sandbox)
4. Get your Consumer Key and Consumer Secret
5. Note your Shortcode (usually same as till number)

---

## Setup Steps

### Step 1: Configure Till Number in Admin Panel

1. Log in as admin
2. Navigate to **Admin → Payment Configuration** (`/admin/payment-config`)
3. Enter your M-Pesa Till Number
4. Enter your Shortcode (usually same as till number)
5. Click "Save Configuration"

### Step 2: Register C2B URLs with Safaricom

You need to register two URLs with Safaricom to receive payment notifications:

**Validation URL:**
```
https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/c2b-validate-payment
```

**Confirmation URL:**
```
https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/c2b-confirm-payment
```

#### Using Daraja API Portal:
1. Log in to https://developer.safaricom.co.ke/
2. Go to your app → APIs → C2B
3. Click "Register URLs"
4. Enter the Validation URL and Confirmation URL
5. Set Response Type to "Completed"
6. Click Register

#### Using API (Alternative):
```bash
curl -X POST "https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ShortCode": "YOUR_TILL_NUMBER",
    "ResponseType": "Completed",
     "ConfirmationURL": "https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/c2b-confirm-payment",
     "ValidationURL": "https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/c2b-validate-payment"
  }'
```

### Step 3: Test the Integration

#### Test Payment (Sandbox):
1. Use Safaricom's test credentials
2. Make a test payment with account number "ABC1" (where ABC1 is a real member ID from your system)
3. Check if payment appears in:
   - Member's dashboard
   - Contribution/deposit history
   - Database (contributions or saving_deposits table)

#### Test Payment (Production):
1. Ask a member to make a small test payment (e.g., KSh 10)
2. Ensure they use their correct Member ID as account number
3. Verify payment is credited within 1 minute
4. Check SMS notification was sent

### Step 4: Member Education

Create materials to educate members:

**Member Guide Example:**
```
HOW TO PAY OFFLINE

Your Member ID: ABC7

To make a payment:
1. Open M-Pesa on your phone
2. Select "Lipa na M-Pesa"
3. Select "Buy Goods and Services"
4. Enter Till Number: 123456
5. Enter Amount
6. Enter Account Number: ABC7
7. Enter PIN and confirm

Your payment will appear in your dashboard within 1 minute!
```

---

## Database Schema

The system uses these key tables:

### Chama
- `group_code` (TEXT): 3-character group identifier (e.g., "ABC")

### Saving Groups
- `group_code` (TEXT): 3-character group identifier (e.g., "XYZ")

### Chama Members
- `member_code` (TEXT): Group code + order index (e.g., "ABC1", "ABC2")

### Saving Group Members
- `unique_member_id` (TEXT): Group code + member number (e.g., "XYZ1", "XYZ2")

---

## Edge Functions

### 1. c2b-validate-payment
**Purpose**: Validates incoming payments before they're processed

**Location**: `supabase/functions/c2b-validate-payment/index.ts`

**What it does**:
- Validates account number format
- Validates payment amount
- Returns accept/reject response to M-Pesa

### 2. c2b-confirm-payment
**Purpose**: Processes confirmed payments and credits member accounts

**Location**: `supabase/functions/c2b-confirm-payment/index.ts`

**What it does**:
- Receives payment confirmation from M-Pesa
- Parses member ID from account number
- Identifies if it's a Chama or Savings Group payment
- Records contribution or deposit
- Updates member balances
- Sends SMS confirmation
- Prevents duplicate payments

---

## Testing Guide

### Unit Tests

**Test 1: Group Code Generation**
```sql
-- Should generate unique 3-letter codes
SELECT generate_group_code();
-- Verify: Returns code like "ABC", "XYZ", etc.
```

**Test 2: Member Code Generation**
```sql
-- Should combine group code and member number
SELECT generate_short_member_code('ABC', 7);
-- Expected: "ABC7"
```

**Test 3: Backfill Verification**
```sql
-- All chamas should have group codes
SELECT COUNT(*) FROM chama WHERE group_code IS NULL;
-- Expected: 0

-- All members should have short member codes
SELECT COUNT(*) FROM chama_members WHERE member_code NOT LIKE '____%';
-- Expected: 0 (all codes should be at least 4 chars: ABC1, ABC10, etc.)
```

### Integration Tests

**Test 4: C2B Callback Processing**
```bash
# Simulate M-Pesa callback
curl -X POST "http://localhost:54321/functions/v1/c2b-confirm-payment" \
  -H "Content-Type: application/json" \
  -d '{
    "TransAmount": "1000",
    "BillRefNumber": "ABC1",
    "TransID": "TEST123456",
    "MSISDN": "254712345678",
    "FirstName": "John",
    "LastName": "Doe"
  }'

# Expected response:
# {"ResultCode":0,"ResultDesc":"Payment accepted and recorded","type":"chama"}
```

**Test 5: Invalid Member ID**
```bash
curl -X POST "http://localhost:54321/functions/v1/c2b-confirm-payment" \
  -H "Content-Type: application/json" \
  -d '{
    "TransAmount": "1000",
    "BillRefNumber": "INVALID",
    "TransID": "TEST123457",
    "MSISDN": "254712345678"
  }'

# Expected response:
# {"ResultCode":1,"ResultDesc":"Member not found with ID: INVALID"}
```

**Test 6: Duplicate Payment Prevention**
```bash
# Send same transaction twice
curl -X POST "http://localhost:54321/functions/v1/c2b-confirm-payment" \
  -H "Content-Type: application/json" \
  -d '{
    "TransAmount": "1000",
    "BillRefNumber": "ABC1",
    "TransID": "TEST123456",
    "MSISDN": "254712345678"
  }'

# Second call should return:
# {"ResultCode":0,"ResultDesc":"Payment already processed"}
```

---

## Troubleshooting

### Issue: Payment not showing up

**Possible causes**:
1. **Wrong Member ID**: Member used incorrect ID as account number
   - Check: Look for similar IDs (e.g., "AB1" instead of "ABC1")
   - Solution: Educate member on correct ID format

2. **C2B URLs not registered**: Safaricom isn't sending callbacks
   - Check: No logs in edge function
   - Solution: Re-register URLs in Daraja portal

3. **Member not found**: Member ID doesn't exist in database
   - Check: Query `chama_members` or `saving_group_members` for the ID
   - Solution: Verify member has been properly added to group

4. **Callback failed**: Error in edge function processing
   - Check: Edge function logs for errors
   - Solution: Review logs and fix any database/logic issues

### Issue: Duplicate payments

**Cause**: Same M-Pesa receipt number processed twice

**Solution**: System has built-in duplicate prevention. Check `contributions` or `saving_deposits` table for duplicates by `payment_reference`.

### Issue: SMS not sent

**Cause**: SMS service failing (non-critical)

**Solution**: 
- Check `send-transactional-sms` edge function logs
- Verify SMS credentials are configured
- Note: Payment still processes even if SMS fails

---

## Security Considerations

### 1. Callback Authentication
- M-Pesa callbacks should come from known Safaricom IPs
- Consider adding IP whitelist validation in edge function

### 2. Duplicate Prevention
- System checks for duplicate M-Pesa receipt numbers
- Prevents double-crediting accounts

### 3. Member Verification
- Only active, approved members can receive payments
- Invalid member IDs are rejected

### 4. Amount Validation
- Minimum/maximum payment amounts can be configured
- Validation happens in C2B validation endpoint

---

## Monitoring

### Key Metrics to Track

1. **Payment Success Rate**: % of callbacks successfully processed
2. **Average Processing Time**: Time from payment to credit
3. **Failed Payments**: Count of rejected/failed payments
4. **Member ID Errors**: Count of invalid member ID attempts

### Dashboard Queries

**Recent Offline Payments:**
```sql
SELECT 
  c.name as group_name,
  cm.member_code,
  co.amount,
  co.payment_reference,
  co.created_at
FROM contributions co
JOIN chama_members cm ON co.member_id = cm.id
JOIN chama c ON co.chama_id = c.id
WHERE co.payment_notes LIKE '%Offline payment%'
ORDER BY co.created_at DESC
LIMIT 20;
```

**Failed Payment Attempts:**
Check edge function logs for errors:
```bash
supabase functions logs c2b-confirm-payment --tail
```

---

## Maintenance

### Regular Tasks

1. **Monitor logs weekly** for errors or unusual patterns
2. **Review failed payments** and contact affected members
3. **Update member education** materials based on common issues
4. **Test payment flow monthly** to ensure everything works

### Updates Required When:

1. **Till number changes**: Update in admin panel and re-register C2B URLs
2. **M-Pesa API changes**: Update edge functions accordingly
3. **New group types added**: Extend edge function logic to handle new types

---

## Support

For issues or questions:
1. Check edge function logs first
2. Verify member ID exists in database
3. Confirm C2B URLs are registered
4. Test with small amount payment
5. Contact Safaricom support for M-Pesa API issues

---

## Appendix: API Reference

### M-Pesa C2B Callback Payload

```json
{
  "TransactionType": "Pay Bill",
  "TransID": "QCH7X8V9Q9",
  "TransTime": "20231201120000",
  "TransAmount": "1000.00",
  "BusinessShortCode": "123456",
  "BillRefNumber": "ABC7",
  "InvoiceNumber": "",
  "OrgAccountBalance": "",
  "ThirdPartyTransID": "",
  "MSISDN": "254712345678",
  "FirstName": "JOHN",
  "MiddleName": "M",
  "LastName": "DOE"
}
```

### System Response Format

**Success:**
```json
{
  "ResultCode": 0,
  "ResultDesc": "Payment accepted and recorded for Chama",
  "type": "chama"
}
```

**Failure:**
```json
{
  "ResultCode": 1,
  "ResultDesc": "Member not found with ID: ABC7"
}
```

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**System Status**: Active (Till number pending configuration)
