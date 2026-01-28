
# Fix B2C Withdrawal Payout - Deployment & Code Issues

## Problem Identified

Based on my investigation, I found the **exact cause** of the B2C payout failures:

1. **Edge functions not deployed**: The recent code fixes made to `mpesa-b2c-payout`, `mpesa-b2c-callback`, `withdrawals-crud`, and `retry-failed-payouts` were NOT deployed to the published/production environment
2. **Withdrawals stuck in "approved"**: Multiple withdrawals show `b2c_attempt_count: 0` with no notes or payment references, meaning the B2C initiation call never executed
3. **No edge function logs**: The absence of any logs for these functions confirms they're either not being called or the deployed version is outdated/broken

## Root Cause

The code changes from the previous plan were implemented in the codebase but the edge functions were not re-deployed. The production environment is running old code that lacks the reliability improvements.

## Solution

### Step 1: Deploy All Updated Edge Functions

Force re-deploy all B2C-related edge functions to production:
- `mpesa-b2c-payout` (stores predictable reference before API call)
- `mpesa-b2c-callback` (robust fallback lookup methods)
- `withdrawals-crud` (awaited B2C calls with proper error handling)
- `retry-failed-payouts` (stuck withdrawal recovery)

### Step 2: Verify CORS Headers Include PATCH Method

Ensure the `withdrawals-crud` function can handle PATCH requests from the admin panel. The current CORS headers in the function use:
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

This is missing the `Access-Control-Allow-Methods` header which can cause preflight failures for PATCH requests from the browser.

**Fix**: Update the CORS headers to explicitly include all HTTP methods.

### Step 3: Reset Stuck Withdrawals

After deployment, run a one-time fix to reset the stuck "approved" withdrawals so the retry system can pick them up:
- Mark withdrawals with `status = 'approved'` and `b2c_attempt_count = 0` as `pending_retry`
- This allows the `retry-failed-payouts` cron to trigger B2C for them

### Step 4: Add Better Error Feedback in Admin Panel

Improve the error message displayed when B2C initiation fails to show the actual M-Pesa error (e.g., "B2C credentials not configured" or specific API error codes).

## Technical Implementation Details

### File 1: `supabase/functions/withdrawals-crud/index.ts`

Update CORS headers to include all methods:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};
```

### File 2: `supabase/functions/mpesa-b2c-payout/index.ts`

Update CORS headers to match:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};
```

### File 3: `supabase/functions/mpesa-b2c-callback/index.ts`

Update CORS headers to match:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};
```

### File 4: `supabase/functions/retry-failed-payouts/index.ts`

Import updated shared CORS headers that already include methods.

### Step 5: Fix Stuck Withdrawals via SQL

After deployment, run this SQL to reset stuck withdrawals:
```sql
UPDATE withdrawals
SET 
  status = 'pending_retry',
  notes = COALESCE(notes, '') || E'\n[SYSTEM] Reset from stuck approved at ' || now()::text
WHERE status = 'approved'
  AND b2c_attempt_count = 0
  AND created_at < now() - interval '1 hour';
```

## Expected Flow After Fix

**User Withdrawal (Mchango with M-Pesa)**:
1. User requests withdrawal ➔ Status = `approved` (auto-approved)
2. System immediately calls B2C payout ➔ Status = `processing`
3. M-Pesa callback received ➔ Status = `completed`
4. Balance updated atomically

**Admin Approval (Chama or manual)**:
1. Admin clicks "Send via M-Pesa" ➔ PATCH call to `withdrawals-crud`
2. Function updates status to `approved`, triggers B2C payout
3. B2C function stores reference, calls M-Pesa ➔ Status = `processing`
4. Callback updates to `completed` or `failed`

**On Failure**:
- If B2C fails, status = `pending_retry`
- Retry cron runs every 30 minutes
- After 3 attempts, status = `failed`
- Admin must reset to allow new request

## Files Modified

1. `supabase/functions/withdrawals-crud/index.ts` - CORS headers
2. `supabase/functions/mpesa-b2c-payout/index.ts` - CORS headers
3. `supabase/functions/mpesa-b2c-callback/index.ts` - CORS headers

## Deployment Required

After code changes, all four edge functions must be deployed:
- `withdrawals-crud`
- `mpesa-b2c-payout`
- `mpesa-b2c-callback`
- `retry-failed-payouts`
