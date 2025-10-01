# Database Setup & Testing Guide

## Overview
This guide explains how to set up the database, load seed data, and test the CRUD APIs for the Chama & Mchango platform.

## Database Schema

### Tables Created
1. **profiles** - User profiles with KYC information
2. **user_roles** - User role assignments (admin, user)
3. **mchango** - Fundraising campaigns
4. **chama** - Savings groups
5. **chama_members** - Members of each Chama with unique member codes
6. **contributions** - Chama member contributions
7. **transactions** - All payment transactions
8. **payouts** - Payout requests and processing
9. **audit_logs** - System audit trail

### Key Features
- **Slug-based URLs**: Both Mchango and Chama support slug-based URLs for SEO-friendly access
- **Member Codes**: Each Chama member gets a unique code (e.g., TUM001, TUM002)
- **Managers**: Chama can have multiple managers who can update group settings
- **Payment References**: All transactions track payment reference numbers
- **WhatsApp Integration**: Links for group communication
- **Audit Trail**: All important actions are logged
- **RLS Security**: Row Level Security policies protect all data

## Loading Seed Data

### Step 1: Sign Up a User
First, create a test user through the app:
1. Go to `/auth`
2. Sign up with your email and password
3. Complete KYC if needed (or skip for testing)

### Step 2: Get Your User ID
In Lovable Cloud dashboard, run this query:
```sql
SELECT id, email FROM profiles ORDER BY created_at DESC LIMIT 1;
```

### Step 3: Load Seed Data
In Lovable Cloud dashboard, run the seed data from `supabase/seed.sql` file.

This will create:
- ✅ 1 sample Mchango: "Medical Emergency for Jane Doe"
- ✅ 1 sample Chama: "Tumaini Savings Group" 
- ✅ 6 member codes (TUM001-TUM006)
- ✅ 1 sample transaction
- ✅ 1 sample contribution

### Step 4: Make Test User an Admin (Optional)
To access admin features:
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('YOUR-USER-ID-HERE', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

## API Endpoints

### Base URL
```
https://ahhcbwbvueimezmtftte.supabase.co/functions/v1
```

### Authentication
All endpoints (except send-otp) require JWT authentication:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

Get your JWT token after logging in (stored in browser localStorage or use Supabase client).

### Available Endpoints

#### Mchango (Fundraising Campaigns)
- `GET /mchango-crud` - List all active campaigns
- `GET /mchango-crud/{id}` - Get campaign by ID or slug
- `POST /mchango-crud` - Create new campaign
- `PUT /mchango-crud/{id}` - Update campaign
- `DELETE /mchango-crud/{id}` - Cancel campaign (soft delete)

#### Chama (Savings Groups)
- `GET /chama-crud` - List all active groups
- `GET /chama-crud/{id}` - Get group by ID or slug
- `POST /chama-crud` - Create new group
- `PUT /chama-crud/{id}` - Update group
- `DELETE /chama-crud/{id}` - Deactivate group (soft delete)

#### Contributions
- `GET /contributions-crud?chama_id={id}` - List contributions for a Chama
- `POST /contributions-crud` - Record new contribution

#### Transactions
- `GET /transactions-crud` - List user's transactions
- `POST /transactions-crud` - Create new transaction

## Testing with Postman

### Step 1: Import Collection
1. Open Postman
2. Click Import
3. Select `POSTMAN_COLLECTION.json` from the project root
4. Collection will be imported with all endpoints pre-configured

### Step 2: Set Environment Variables
In Postman, set these variables:
- `base_url`: `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1`
- `jwt_token`: Your JWT token from Supabase auth

### Step 3: Get JWT Token
After logging in through the app, get your JWT token:

**Method 1 - Browser Console:**
```javascript
// In browser console on your app
const session = await (await fetch('/api/auth/session')).json();
console.log(session.access_token);
```

**Method 2 - From Supabase Client:**
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log(session.access_token);
```

**Method 3 - Network Tab:**
- Open browser DevTools → Network tab
- Make any authenticated request
- Check request headers for `Authorization: Bearer ...`
- Copy the token part

### Step 4: Test Endpoints
Try these requests in order:

1. **List Mchangos**
   - Request: `GET /mchango-crud`
   - Should return the seed data

2. **Get Mchango by Slug**
   - Request: `GET /mchango-crud/medical-emergency-jane-doe`
   - Should return single campaign

3. **Create New Mchango**
   - Request: `POST /mchango-crud`
   - Body:
     ```json
     {
       "title": "School Fees Support",
       "description": "Help students pay school fees",
       "goal_amount": 200000,
       "category": "Education",
       "whatsapp_link": "https://wa.me/254712345678"
     }
     ```

4. **Create Transaction (Donation)**
   - Request: `POST /transactions-crud`
   - Get mchango_id from previous responses
   - Body:
     ```json
     {
       "mchango_id": "UUID-FROM-RESPONSE",
       "amount": 10000,
       "payment_reference": "MPESA-TEST-" + Date.now(),
       "payment_method": "M-Pesa",
       "transaction_type": "donation",
       "status": "completed"
     }
     ```
   - Note: When status is "completed", the mchango's current_amount will auto-update!

5. **List My Transactions**
   - Request: `GET /transactions-crud`
   - Should show your donation

## Testing with cURL

### List Mchangos
```bash
curl -X GET \
  https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Create Mchango
```bash
curl -X POST \
  https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Community Water Project",
    "description": "Building a water well for the community",
    "goal_amount": 800000,
    "category": "Infrastructure"
  }'
```

### Get by Slug
```bash
curl -X GET \
  https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/medical-emergency-jane-doe \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Testing Chama APIs

### Create Chama
```bash
curl -X POST \
  https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/chama-crud \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Savers Group",
    "description": "Save together every week",
    "contribution_amount": 3000,
    "contribution_frequency": "weekly",
    "whatsapp_link": "https://wa.me/254712345678",
    "max_members": 15
  }'
```

### Get Chama by Slug
```bash
curl -X GET \
  https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/chama-crud/tumaini-savings-group \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## OpenAPI Specification

Full API documentation is available in `OPENAPI_SPEC.yaml`. You can:

1. **View in Swagger Editor**: 
   - Go to https://editor.swagger.io/
   - Paste the contents of `OPENAPI_SPEC.yaml`

2. **Generate API Docs**:
   - Use tools like Redoc or Swagger UI
   - Host the spec file to generate interactive documentation

## Common Issues & Solutions

### Issue: "Unauthorized" Error
**Solution**: Make sure your JWT token is valid and included in the Authorization header.

### Issue: "Row Level Security Policy Violation"
**Solution**: Check that:
- You're authenticated as the correct user
- The user has necessary permissions
- KYC is approved if creating Mchango/Chama

### Issue: Slug Already Exists
**Solution**: Slugs must be unique. Either:
- Change the title to generate a different slug
- Provide a custom unique slug in your request

### Issue: Can't See Other Users' Data
**Solution**: This is by design! RLS policies ensure:
- Users see only their own transactions
- Members see only their Chama's data
- Public can view active Mchangos/Chamas
- Admins can view everything

## Database Queries for Testing

### Check Current Amounts
```sql
SELECT title, goal_amount, current_amount, 
       ROUND((current_amount / goal_amount * 100), 2) as progress_pct
FROM mchango
WHERE status = 'active';
```

### View All Transactions
```sql
SELECT t.*, 
       p.full_name as user_name,
       m.title as mchango_title
FROM transactions t
LEFT JOIN profiles p ON t.user_id = p.id
LEFT JOIN mchango m ON t.mchango_id = m.id
ORDER BY t.created_at DESC;
```

### Check Chama Members
```sql
SELECT c.name as chama_name,
       cm.member_code,
       p.full_name,
       cm.is_manager,
       cm.status
FROM chama_members cm
JOIN chama c ON cm.chama_id = c.id
LEFT JOIN profiles p ON cm.user_id = p.id
ORDER BY c.name, cm.member_code;
```

### View Contributions Summary
```sql
SELECT c.name as chama_name,
       COUNT(contrib.id) as total_contributions,
       SUM(contrib.amount) as total_amount
FROM chama c
LEFT JOIN contributions contrib ON c.id = contrib.chama_id
WHERE contrib.status = 'completed'
GROUP BY c.id, c.name;
```

## Next Steps

1. ✅ Test all CRUD endpoints in Postman
2. ✅ Create multiple Mchangos and Chamas
3. ✅ Add transactions and verify auto-calculations work
4. ✅ Test RLS policies with different users
5. ✅ Verify audit logs are being created
6. ✅ Test member code generation for Chamas
7. ✅ Verify WhatsApp links work correctly

## Additional Resources

- **API Documentation**: See `OPENAPI_SPEC.yaml`
- **Postman Collection**: See `POSTMAN_COLLECTION.json`
- **Auth Guide**: See `API_DOCUMENTATION.md`
- **Seed Data**: See `supabase/seed.sql`

## Support

For issues or questions:
1. Check the API logs in Lovable Cloud
2. Review RLS policies in the database
3. Verify your JWT token is valid
4. Check the audit_logs table for system actions
