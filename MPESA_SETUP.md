# M-PESA STK Push Integration Guide

## Overview
This guide covers the M-PESA STK Push integration for processing payments through M-PESA. The implementation includes idempotency, server-side payment confirmation, and automatic updates to contribution records.

## Prerequisites
1. M-PESA Developer Account (Daraja API)
2. Sandbox credentials for testing
3. Lovable Cloud backend access

## Required Secrets

Configure these secrets in your Lovable Cloud backend:

### Required
- `MPESA_CONSUMER_KEY` - Your M-PESA app consumer key
- `MPESA_CONSUMER_SECRET` - Your M-PESA app consumer secret
- `MPESA_PASSKEY` - Your M-PESA Lipa Na M-PESA Online passkey

### Optional
- `MPESA_SHORTCODE` - Business shortcode (defaults to 174379 for sandbox)

## Getting Sandbox Credentials

1. **Register on Daraja Portal**
   - Visit: https://developer.safaricom.co.ke/
   - Create an account and log in

2. **Create a Test App**
   - Go to "My Apps" → "Create New App"
   - Select "Lipa Na M-PESA Online" API
   - Note down your Consumer Key and Consumer Secret

3. **Get Sandbox Credentials**
   - Navigate to the "Test Credentials" section
   - Copy the following:
     - Consumer Key
     - Consumer Secret
     - Passkey (for Lipa Na M-PESA Online)
   - Sandbox shortcode: `174379`

4. **Test Phone Number**
   - Use format: `254708374149` (Safaricom test number)
   - Any amount works in sandbox

## API Endpoints

### 1. Initiate STK Push
**Endpoint:** `POST /functions/v1/mpesa-stk-push`

**Headers:**
```
Authorization: Bearer <user-jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "phone_number": "254708374149",
  "amount": 100,
  "account_reference": "CHAMA123",
  "transaction_desc": "Contribution payment",
  "payment_reference": "PAY-2024-001",
  "chama_id": "uuid-here",
  "mchango_id": "uuid-here"
}
```

**Fields:**
- `phone_number` (required) - M-PESA phone number (format: 254XXXXXXXXX)
- `amount` (required) - Amount in KES
- `account_reference` (optional) - Reference shown to user
- `transaction_desc` (optional) - Description shown to user
- `payment_reference` (required) - Unique payment reference for idempotency
- `chama_id` (optional) - Associated Chama ID
- `mchango_id` (optional) - Associated Mchango ID

**Response:**
```json
{
  "success": true,
  "message": "STK Push sent successfully",
  "transaction": {
    "id": "uuid",
    "user_id": "uuid",
    "amount": 100,
    "status": "pending",
    "payment_reference": "PAY-2024-001",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "mpesa_response": {
    "MerchantRequestID": "...",
    "CheckoutRequestID": "...",
    "ResponseCode": "0",
    "ResponseDescription": "Success. Request accepted for processing"
  }
}
```

### 2. M-PESA Callback (Webhook)
**Endpoint:** `POST /functions/v1/mpesa-callback`

This endpoint is called automatically by M-PESA. You don't need to call it manually.

**Callback Flow:**
1. M-PESA sends callback to this endpoint
2. Transaction status is updated (confirmed/failed)
3. If confirmed:
   - M-PESA receipt number is saved
   - Contribution amount is updated
   - Mchango total_collected is incremented

## Testing Instructions

### Step 1: Add Secrets
Add your M-PESA sandbox credentials as secrets in Lovable Cloud:
```
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
```

### Step 2: Test STK Push

Use this curl command (replace `<JWT_TOKEN>` with your actual user token):

```bash
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mpesa-stk-push \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "254708374149",
    "amount": 100,
    "account_reference": "TEST001",
    "transaction_desc": "Test payment",
    "payment_reference": "TEST-'$(date +%s)'"
  }'
```

### Step 3: Complete Payment
1. Check your test phone - you should receive an STK push prompt
2. Enter M-PESA PIN: `1234` (sandbox)
3. Wait for callback processing (5-10 seconds)

### Step 4: Verify Transaction
Query the transactions table to verify status changed to "confirmed":

```sql
SELECT * FROM transactions 
WHERE payment_reference LIKE 'TEST-%' 
ORDER BY created_at DESC 
LIMIT 5;
```

## Idempotency

The system uses `payment_reference` for idempotency:
- Same `payment_reference` = returns existing transaction
- Prevents duplicate charges
- Client should generate unique references (e.g., `CHAMA-{chamaId}-{timestamp}`)

## Transaction Statuses

- `pending` - STK push sent, awaiting user confirmation
- `confirmed` - Payment successful, M-PESA receipt received
- `failed` - Payment failed or cancelled by user

## Error Handling

Common errors:
- `400` - Missing required fields
- `401` - Unauthorized (invalid JWT)
- `500` - M-PESA API error or server error

Check edge function logs for detailed error messages.

## Production Deployment

To move to production:

1. **Get Production Credentials**
   - Apply for M-PESA production access
   - Obtain production consumer key, secret, and passkey
   - Get your production shortcode

2. **Update Secrets**
   - Replace sandbox secrets with production credentials
   - Update `MPESA_SHORTCODE` with your production shortcode

3. **Update API URLs**
   - Change base URL from `sandbox.safaricom.co.ke` to `api.safaricom.co.ke`
   - Update in both edge functions

4. **Test Thoroughly**
   - Test with small amounts first
   - Verify callback processing
   - Monitor transaction statuses

## Postman Collection

Import `POSTMAN_COLLECTION.json` for ready-to-use API examples.

## Support

For M-PESA API issues:
- Daraja Support: https://developer.safaricom.co.ke/support
- Documentation: https://developer.safaricom.co.ke/Documentation

For integration issues, check your Lovable Cloud backend logs.
