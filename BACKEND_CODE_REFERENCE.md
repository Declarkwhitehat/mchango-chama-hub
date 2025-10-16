# Backend Code Reference - All Edge Functions

Complete reference of all Supabase Edge Functions used in the Chama & Mchango platform.

---

## Table of Contents

1. [Authentication & Security](#authentication--security)
   - [capture-login-ip](#1-capture-login-ip)
2. [Admin Functions](#admin-functions)
   - [admin-search](#2-admin-search)
   - [admin-export](#3-admin-export)
3. [Chama Management](#chama-management)
   - [chama-crud](#4-chama-crud)
   - [chama-invite](#5-chama-invite)
   - [chama-join](#6-chama-join)
4. [Contributions & Payments](#contributions--payments)
   - [contributions-crud](#7-contributions-crud)
   - [member-dashboard](#8-member-dashboard)
5. [Mchango (Campaigns)](#mchango-campaigns)
   - [mchango-crud](#9-mchango-crud)
6. [M-Pesa Integration](#m-pesa-integration)
   - [mpesa-stk-push](#10-mpesa-stk-push)
   - [mpesa-callback](#11-mpesa-callback)
7. [Transactions & Withdrawals](#transactions--withdrawals)
   - [transactions-crud](#12-transactions-crud)
   - [withdrawals-crud](#13-withdrawals-crud)
8. [Utilities](#utilities)
   - [send-otp](#14-send-otp)

---

## Authentication & Security

### 1. capture-login-ip

**File:** `supabase/functions/capture-login-ip/index.ts`  
**Auth Required:** Yes  
**Purpose:** Captures user IP address on login/signup for security tracking

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || undefined;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get IP address from request headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') ||
               req.headers.get('cf-connecting-ip') ||
               req.headers.get('fastly-client-ip') ||
               req.headers.get('x-cluster-client-ip') ||
               req.headers.get('x-forwarded') ||
               req.headers.get('forwarded-for') ||
               req.headers.get('forwarded') ||
               'unknown';

    const body = await req.json();
    const { is_signup } = body;

    console.log(`Capturing IP for user ${user.id}: ${ip} (signup: ${is_signup})`);

    // Update profile with IP address
    const updateData: any = {
      last_login_ip: ip,
      last_login_at: new Date().toISOString(),
    };

    if (is_signup) {
      updateData.signup_ip = ip;
    }

    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile with IP:', updateError);
      throw updateError;
    }

    // Log to audit_logs
    const { error: auditError } = await supabaseClient
      .from('audit_logs')
      .insert({
        user_id: user.id,
        table_name: 'auth',
        action: is_signup ? 'signup' : 'login',
        ip_address: ip,
        new_values: { event: is_signup ? 'signup' : 'login', ip: ip }
      });

    if (auditError) {
      console.error('Error creating audit log:', auditError);
    }

    return new Response(JSON.stringify({ 
      success: true,
      ip: ip,
      message: 'IP address captured successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in capture-login-ip:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**Key Features:**
- Captures IP from multiple headers (proxy-aware)
- Stores signup IP and last login IP separately
- Creates audit log entries
- Handles both signup and login events

---

## Admin Functions

### 2. admin-search

**File:** `supabase/functions/admin-search/index.ts`  
**Auth Required:** Yes (Admin only)  
**Purpose:** Universal search across users, members, chamas, mchangos, and transactions

```typescript
// See full code in the file above - 146 lines
// Key endpoints:
// - Search users by name, email, phone, ID number
// - Search member codes
// - Search mchango slugs
// - Search chama slugs
// - Search transactions by reference
```

**Search Types:**
- `all` - Search across all entities
- `user` - Search users
- `email` - Search by email
- `phone` - Search by phone
- `member_code` - Search member codes
- `mchango_slug` - Search mchango slugs
- `transaction_id` - Search transactions

---

### 3. admin-export

**File:** `supabase/functions/admin-export/index.ts`  
**Auth Required:** Yes (Admin only)  
**Purpose:** Export data to CSV format

```typescript
// See full code in the file above - 121 lines
// Export types:
// - transactions: Full transaction history with user details
// - members: Member data with chama associations
```

**CSV Exports:**
- **Transactions CSV:** ID, Date, User Name, Email, Amount, Type, Payment Method, Reference, Status
- **Members CSV:** Member Code, Name, Email, Phone, Chama, Joined Date, Order Index, Status, Is Manager

---

## Chama Management

### 4. chama-crud

**File:** `supabase/functions/chama-crud/index.ts`  
**Auth Required:** Varies by endpoint  
**Purpose:** Complete CRUD operations for Chama groups

**Endpoints:**

#### GET /chama-crud
List all active public chamas
- **Auth:** Optional
- **Returns:** Array of chamas with creator and member info

#### GET /chama-crud/:id
Get single chama by ID or slug
- **Auth:** Optional for public chamas
- **Returns:** Full chama details with members

#### POST /chama-crud
Create new chama (KYC-approved users only)
- **Auth:** Required
- **Validates:** KYC approval, member limits, frequency settings
- **Auto-creates:** Creator as first member and manager

#### PUT /chama-crud/:id
Update chama details
- **Auth:** Required (creator or manager)

#### DELETE /chama-crud/:id
Soft delete (set status to inactive)
- **Auth:** Required (creator)

**Validation Rules:**
- Min members ≥ 5
- Max members ≤ 100 (admin can adjust up to 1000)
- Creator must be KYC-approved
- Unique slug generation

---

### 5. chama-invite

**File:** `supabase/functions/chama-invite/index.ts`  
**Auth Required:** Yes  
**Purpose:** Manage invite codes for chamas

**Endpoints:**

#### POST /chama-invite/generate
Generate invite codes
- **Auth:** Manager only
- **Validates:** Available spots
- **Generates:** 8-character alphanumeric codes

#### GET /chama-invite/list/:chama_id
List all invite codes for chama
- **Auth:** Manager only

#### GET /chama-invite/validate?code=XXX
Validate invite code
- **Auth:** Optional
- **Checks:** Active status, expiration, usage

#### DELETE /chama-invite/:id
Deactivate invite code
- **Auth:** Manager only

**Code Format:** `XXXXXX` (8 uppercase alphanumeric)

---

### 6. chama-join

**File:** `supabase/functions/chama-join/index.ts`  
**Auth Required:** Yes  
**Purpose:** Handle join requests and member approvals

**Endpoints:**

#### POST /chama-join
Request to join chama
- **Auto-assigns:** Sequential order_index based on join date
- **Generates:** Member code: `{slug}-M{order}`
- **Creates:** Pending membership

#### PUT /chama-join/approve/:member_id
Approve/reject join request
- **Auth:** Manager only
- **Updates:** approval_status to 'approved' or 'rejected'

#### GET /chama-join/pending/:chama_id
Get pending requests
- **Auth:** Manager only
- **Returns:** List of pending members with profiles

**Key Logic:**
- Order index is STRICTLY chronological (based on join date)
- Cannot be manually modified
- Member code format: `tech-savers-M005`

---

## Contributions & Payments

### 7. contributions-crud

**File:** `supabase/functions/contributions-crud/index.ts`  
**Auth Required:** Yes  
**Purpose:** Track member contributions

**Endpoints:**

#### GET /contributions-crud?chama_id=xxx
List contributions for chama
- **Returns:** Contributions with member and payer details

#### POST /contributions-crud
Record contribution
- **Validates:** Member exists, payer is member
- **Calculates:** Overpayment (credit) or underpayment (deficit)
- **Updates:** Member balance_credit and balance_deficit

**Balance Logic:**
```typescript
if (paid > expected) {
  credit += (paid - expected)
} else if (paid < expected) {
  deficit += (expected - paid)
}
```

---

### 8. member-dashboard

**File:** `supabase/functions/member-dashboard/index.ts`  
**Auth Required:** Yes  
**Purpose:** Comprehensive member dashboard data

**Returns:**
```typescript
{
  member: {
    id, full_name, email, phone, member_code,
    joined_at, order_index, balance_credit, 
    balance_deficit, last_payment_date, next_due_date
  },
  chama: {
    name, contribution_amount, contribution_frequency,
    commission_rate, member_count
  },
  current_cycle: {
    is_paid, amount_paid, amount_due, paid_at
  },
  payment_history: [...contributions],
  payout_schedule: {
    position_in_queue, estimated_payout_date, estimated_amount
  }
}
```

---

## Mchango (Campaigns)

### 9. mchango-crud

**File:** `supabase/functions/mchango-crud/index.ts`  
**Auth Required:** Varies by endpoint  
**Purpose:** CRUD operations for fundraising campaigns

**Endpoints:**

#### GET /mchango-crud
List active public mchangos
- **Auth:** Optional
- **Returns:** Active campaigns with creator info

#### GET /mchango-crud/:id
Get single mchango by ID or slug
- **Auth:** Optional for public campaigns

#### POST /mchango-crud
Create new mchango (KYC-approved only)
- **Auth:** Required
- **Validates:** KYC approval, required fields
- **Auto-generates:** Unique slug with timestamp if needed

#### PUT /mchango-crud/:id
Update mchango
- **Auth:** Creator or manager

#### DELETE /mchango-crud/:id
Soft delete (set status to cancelled)
- **Auth:** Creator

**Features:**
- Slug uniqueness with timestamp fallback
- Support for managers array (max 2 additional)
- Public/private visibility control

---

## M-Pesa Integration

### 10. mpesa-stk-push

**File:** `supabase/functions/mpesa-stk-push/index.ts`  
**Auth Required:** Yes (except for guest donations)  
**Purpose:** Initiate M-Pesa STK push payments

**Flow:**
1. Get M-Pesa OAuth token
2. Format phone number (ensure starts with 254)
3. Generate password (base64(shortcode + passkey + timestamp))
4. Send STK push request
5. Create transaction record (or skip for donations)

**Request:**
```typescript
{
  phone_number: string,
  amount: number,
  account_reference: string,
  transaction_desc: string,
  payment_reference?: string,
  chama_id?: string,
  mchango_id?: string,
  callback_metadata?: {
    donation_id?: string
  }
}
```

**Phone Formatting:**
- `0712345678` → `254712345678`
- `+254712345678` → `254712345678`
- `712345678` → `254712345678`

---

### 11. mpesa-callback

**File:** `supabase/functions/mpesa-callback/index.ts`  
**Auth Required:** No (called by M-Pesa)  
**Purpose:** Process M-Pesa payment callbacks

**Handles:**
1. **Donations:** Updates `mchango_donations` table
2. **Transactions:** Updates `transactions` table
3. **Result Codes:** 0 = success, others = failure

**Callback Data:**
```typescript
{
  Body: {
    stkCallback: {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata: {
        Item: [{ Name: 'MpesaReceiptNumber', Value: 'XXX' }]
      }
    }
  }
}
```

---

## Transactions & Withdrawals

### 12. transactions-crud

**File:** `supabase/functions/transactions-crud/index.ts`  
**Auth Required:** Yes  
**Purpose:** Manage user transactions

**Endpoints:**

#### GET /transactions-crud
List user's transactions
- **Returns:** Transactions with mchango/chama details

#### POST /transactions-crud
Create transaction
- **Auto-assigns:** user_id from auth

---

### 13. withdrawals-crud

**File:** `supabase/functions/withdrawals-crud/index.ts`  
**Auth Required:** Yes  
**Purpose:** Manage withdrawal requests

**Endpoints:**

#### POST /
Create withdrawal request
- **Validates:** 
  - Creator/manager status
  - Available balance
  - No pending withdrawals
  - Turn-based for non-managers (chamas)
- **Calculates:** Commission and net amount

#### GET /
List withdrawals
- **Filters:** By chama_id or mchango_id

#### PATCH /:id
Approve/reject withdrawal (Admin only)
- **Updates:** Status, reviewed_at, reviewed_by
- **Sets:** payment_reference or rejection_reason

**Turn Logic (Chamas):**
```typescript
withdrawalCount = completed withdrawals
currentTurnIndex = withdrawalCount % totalMembers
currentTurnMember = members[currentTurnIndex]
// Only currentTurnMember can withdraw (unless manager)
```

**Commission Calculation:**
```typescript
commissionAmount = amount * commissionRate (default 5%)
netAmount = amount - commissionAmount
```

---

## Utilities

### 14. send-otp

**File:** `supabase/functions/send-otp/index.ts`  
**Auth Required:** No  
**Purpose:** Generate and send OTP codes

**Request:**
```typescript
{
  phone: string,
  type: 'sms' | 'email'
}
```

**Response:**
```typescript
{
  success: true,
  message: 'OTP sent successfully',
  otp: '123456' // Only in development mode
}
```

**TODO:**
- Integrate Twilio for SMS
- Integrate AfricasTalking for Africa
- Store OTP in database with expiry
- Implement verification endpoint

---

## Environment Variables Required

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_DB_URL=postgresql://xxx

# M-Pesa
MPESA_CONSUMER_KEY=xxx
MPESA_CONSUMER_SECRET=xxx
MPESA_PASSKEY=xxx
MPESA_SHORTCODE=174379
```

---

## Configuration (supabase/config.toml)

```toml
project_id = "ahhcbwbvueimezmtftte"

[functions.send-otp]
verify_jwt = false

[functions.mchango-crud]
verify_jwt = false

[functions.chama-crud]
verify_jwt = false

[functions.chama-invite]
verify_jwt = true

[functions.chama-join]
verify_jwt = true

[functions.contributions-crud]
verify_jwt = true

[functions.transactions-crud]
verify_jwt = true

[functions.member-dashboard]
verify_jwt = true

[functions.admin-search]
verify_jwt = true

[functions.admin-export]
verify_jwt = true

[functions.mpesa-stk-push]
verify_jwt = true

[functions.mpesa-callback]
verify_jwt = false

[functions.capture-login-ip]
verify_jwt = true

[functions.withdrawals-crud]
verify_jwt = true
```

---

## Common Patterns

### CORS Headers
All functions use these standard CORS headers:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

### Authentication Check
```typescript
const { data: { user } } = await supabaseClient.auth.getUser();
if (!user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

### Admin Role Check
```typescript
const { data: userRole } = await supabaseClient
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .eq('role', 'admin')
  .maybeSingle();

if (!userRole) {
  return new Response(JSON.stringify({ error: 'Forbidden - Admin only' }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

### Error Handling
```typescript
try {
  // Function logic
} catch (error: any) {
  console.error('Error in function-name:', error);
  return new Response(JSON.stringify({ error: error.message }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

---

## Security Best Practices

1. **Always validate user authorization** before performing operations
2. **Use RLS policies** in conjunction with edge functions
3. **Never trust client input** - validate everything
4. **Log important operations** for audit trails
5. **Use service role key** only when necessary (mpesa-callback)
6. **Sanitize error messages** before sending to client
7. **Rate limit** sensitive operations (TODO)
8. **Verify KYC status** for financial operations

---

## Testing Endpoints

### Local Development
```bash
# Start local Supabase
supabase start

# Test function
curl -X POST \
  http://localhost:54321/functions/v1/function-name \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

### Production
```bash
curl -X POST \
  https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/function-name \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

---

## Deployment

Edge functions are **automatically deployed** when you push to the repository. No manual deployment needed.

**Deployment Steps:**
1. Commit code changes
2. Push to repository
3. Functions are automatically deployed by Lovable Cloud
4. Check logs for any deployment errors

---

## Monitoring & Logs

View edge function logs:
```bash
# View specific function logs
supabase functions logs function-name

# View all function logs
supabase functions logs

# Follow logs in real-time
supabase functions logs function-name --follow
```

In Lovable dashboard:
- Navigate to Backend → Edge Functions
- Click on function name to view logs
- Filter by error, info, or debug levels

---

## Future Improvements

1. **Rate Limiting:** Implement request throttling
2. **Caching:** Add Redis for frequently accessed data
3. **Webhooks:** Add webhook support for external integrations
4. **Batch Operations:** Support bulk updates
5. **GraphQL:** Consider GraphQL endpoint for complex queries
6. **Real-time:** Add WebSocket support for live updates
7. **Analytics:** Enhanced tracking and reporting
8. **SMS Integration:** Complete Twilio/AfricasTalking setup

---

**Last Updated:** 2025-10-16  
**Total Functions:** 14  
**Total Lines of Code:** ~3,500+
