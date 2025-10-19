# Chama Creation Implementation

## Overview
Implemented chama creation feature with manager rules as specified in the task requirements.

## Features Implemented

### 1. Chama Creation Rules
- ✅ Only KYC-approved users can create chamas
- ✅ Min members: 2 (configurable)
- ✅ Max members: ≤200 (enforced)
- ✅ Commission: 5% on total pool before payout
- ✅ Creator automatically becomes manager
- ✅ Payout order: Auto by join_date (default)
- ✅ Visibility: Public (listable but internal details private)

### 2. Required Fields
- **name**: Group name (required)
- **description**: Group description (required)
- **contribution_amount**: Amount per contribution in KES (required, min: 100)
- **contribution_frequency**: daily / weekly / monthly / every_n_days (required)
- **every_n_days_count**: Number of days (required if frequency is every_n_days)
- **min_members**: Minimum members (default: 2, min: 2)
- **max_members**: Maximum members (required, max: 200)
- **is_public**: Visibility (default: true)
- **payout_order**: join_date or manager_override (default: join_date)
- **whatsapp_link**: WhatsApp group link (optional)

### 3. Commission Calculation
- 5% commission rate on total pool
- Total pool = contribution_amount × number_of_approved_members
- Net payout = total pool - commission

## Testing

### Test 1: Create Chama as Manager (KYC Approved)
1. Login with KYC-approved user
2. Navigate to `/chama/create`
3. Fill in the form:
   - Name: "Test Savings Group"
   - Description: "Testing chama creation"
   - Contribution Amount: 5000
   - Frequency: Weekly
   - Min Members: 2
   - Max Members: 50
   - Visibility: Public
   - Payout Order: Auto by Join Date
4. Click "Create Chama Group"
5. Verify redirect to chama detail page
6. Verify creator is shown as manager in members list

### Test 2: View Chama Details as User
1. Login as regular user (not admin, not manager)
2. Navigate to a public chama (e.g., from chama list)
3. Verify you can see:
   - Chama name and description
   - Contribution amount and frequency
   - Total pool and commission
   - Member count
   - List of approved members
4. Verify "Request to Join" button is visible

### Test 3: View Chama Details as Admin
1. Login as admin user
2. Navigate to any chama
3. Verify you can see all chama details
4. Verify you can see all members (including pending)

### Test 4: Validate Constraints
1. Try to create chama with max_members > 200
   - Expected: Error message "Maximum members cannot exceed 200"
2. Try to create chama with min_members < 2
   - Expected: Error message "Minimum members must be at least 2"
3. Try to create chama without KYC approval
   - Expected: Warning message and disabled form

## API Endpoints

### POST /functions/v1/chama-crud
Create a new chama (requires KYC approval)

**Request Body:**
```json
{
  "name": "Test Savings Group",
  "description": "Testing chama creation",
  "contribution_amount": 5000,
  "contribution_frequency": "weekly",
  "min_members": 2,
  "max_members": 50,
  "is_public": true,
  "payout_order": "join_date",
  "whatsapp_link": "https://chat.whatsapp.com/..."
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Test Savings Group",
    "slug": "test-savings-group",
    "created_by": "user_id",
    "status": "active",
    "commission_rate": 0.05,
    ...
  }
}
```

### GET /functions/v1/chama-crud?id={id}
Fetch chama details by ID or slug

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Test Savings Group",
    "chama_members": [
      {
        "id": "member_id",
        "user_id": "user_id",
        "member_code": "test-savings-M001",
        "is_manager": true,
        "status": "active",
        "approval_status": "approved",
        "profiles": {
          "full_name": "John Doe",
          "email": "john@example.com",
          "phone": "+254700000000"
        }
      }
    ],
    ...
  }
}
```

## Database Schema

### chama table
- `id`: uuid (primary key)
- `name`: text (required)
- `slug`: text (unique, auto-generated)
- `description`: text
- `contribution_amount`: numeric (required)
- `contribution_frequency`: enum (required)
- `every_n_days_count`: integer
- `min_members`: integer (default: 2)
- `max_members`: integer (required, max: 200)
- `is_public`: boolean (default: true)
- `payout_order`: text (default: 'join_date')
- `whatsapp_link`: text
- `commission_rate`: numeric (default: 0.05)
- `created_by`: uuid (foreign key to profiles)
- `status`: enum (default: 'active')
- `created_at`: timestamp
- `updated_at`: timestamp

### chama_members table
- `id`: uuid (primary key)
- `chama_id`: uuid (foreign key to chama)
- `user_id`: uuid (foreign key to profiles)
- `member_code`: text (unique, auto-generated)
- `is_manager`: boolean (default: false)
- `status`: enum (default: 'active')
- `approval_status`: text (default: 'pending')
- `order_index`: integer (auto-incremented)
- `joined_at`: timestamp

## RLS Policies

### chama table
- KYC approved users can create chamas
- Creators can view and update their own chamas
- Public chamas are visible to verified users
- Admins can view all chamas

### chama_members table
- Users can request to join public chamas
- Managers can update member approval status
- Members can view their own membership details
- Admins can view and manage all members

## Triggers

### add_creator_as_manager
Automatically adds the creator as the first manager with approved status when a chama is created.

## Commission Calculator Utility

Located in `src/utils/commissionCalculator.ts`:
- `getChamaCommissionInfo(totalAmount, customRate?)`: Calculate commission details for chama
- Returns: total amount, commission, net balance, rate, percentage

## Files Modified

1. `src/pages/ChamaCreate.tsx` - Updated constraints (min: 2, max: 200)
2. `src/pages/ChamaDetail.tsx` - Implemented real data fetching from database
3. `supabase/functions/chama-crud/index.ts` - Added chama creation logic
4. `src/utils/commissionCalculator.ts` - Commission calculation utilities (existing)

## Next Steps

1. Test chama creation flow end-to-end
2. Test viewing chama details as different user roles
3. Verify RLS policies are working correctly
4. Test constraint validations
5. Add unit tests for commission calculations
