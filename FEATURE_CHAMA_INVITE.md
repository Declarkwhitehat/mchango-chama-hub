# Feature: Chama Invite, Unique Member Codes & Joining Flow

## Overview
Complete implementation of chama invitation system with unique member codes, manager approval flow, and member privacy controls.

## Features Implemented ✅

### 1. Invite Code Generation
- **Manager Capability**: Only chama managers can generate invite codes
- **Bulk Generation**: Generate up to 20 codes at once
- **Unique Codes**: 8-character alphanumeric codes (e.g., "ABC12XYZ")
- **One-Time Use**: Each code can only be used once
- **Spot Validation**: Cannot generate more codes than available spots
- **Optional Expiry**: Codes can have expiration dates (currently set to never expire)
- **Database Function**: Uses `generate_invite_code()` for unique code generation

### 2. Join Request Flow
- **Authenticated Only**: Users must be logged in to join
- **Code Validation**: Real-time validation with chama details preview
- **Pending Approval**: Join requests require manager approval
- **Unique Member Codes**: Auto-generated in format `{slug}-M{order}` (e.g., "test-chama-M002")
- **Sequential Order Index**: Members assigned sequential positions (1, 2, 3...)
- **Join Date Tracking**: `joined_at` timestamp recorded on request submission
- **Duplicate Prevention**: Cannot join same chama twice

### 3. Manager Approval System
- **Approval Interface**: Managers see pending requests with full user details
- **Approve/Reject**: Clear actions with immediate feedback
- **Member Information Display**:
  - Full name, email, phone
  - Request timestamp
  - Pre-assigned member code
  - Pre-assigned order index
- **Real-time Updates**: Pending list refreshes after approval/rejection

### 4. Member Privacy & Access Control
- **RLS Policies**: Row-level security enforces data access
- **Approved Members**: Full access to member list, contributions, details
- **Pending Members**: Limited access, shown "pending approval" message
- **Non-Members**: Can see basic chama info (if public), no member details
- **Member-Only Views**: Tabs and sensitive data hidden from non-members

### 5. Unique Member Codes
- **Format**: `{slug}-M{orderIndex}` where slug is truncated to 10 chars
- **Examples**:
  - Creator: "tech-saves-M001"
  - Member 2: "tech-saves-M002"
  - Member 10: "tech-saves-M010"
- **Database Function**: `generate_member_code(p_chama_id, p_order_index)`
- **Uniqueness**: Enforced via unique constraint on `member_code`

### 6. Order Index Management
- **Sequential Assignment**: 1 (creator), 2, 3, 4...
- **Automatic Calculation**: Based on existing members at join time
- **Payout Order Basis**: Used for determining payout sequence
- **No Gaps**: Even if members leave, order indices remain

## Technical Architecture

### Edge Functions
1. **`chama-invite`** (`supabase/functions/chama-invite/index.ts`)
   - `POST /generate` - Generate bulk invite codes
   - `GET /list/:chama_id` - List all codes for a chama
   - `GET /validate?code=X` - Validate a code and return chama details
   - `DELETE /:id` - Deactivate an invite code

2. **`chama-join`** (`supabase/functions/chama-join/index.ts`)
   - `POST /` - Submit join request using invite code
   - `PUT /approve/:member_id` - Approve or reject join request
   - `GET /pending/:chama_id` - Get pending requests for a chama

### Frontend Components
1. **`ChamaInviteManager.tsx`**
   - Invite code generation UI
   - Active codes list with copy functionality
   - Pending members approval interface
   - Manager-only component

2. **`ChamaJoin.tsx`**
   - Public join page (`/chama/join`)
   - Code validation with live preview
   - Join request submission
   - URL parameter support (`?code=ABC12XYZ`)

3. **`ChamaDetail.tsx`**
   - Integrated `ChamaInviteManager` for managers
   - Member list with codes and order indices
   - Privacy-enforced tabs (members-only)
   - Pending approval status display

### Database Schema
```sql
-- Invite codes table
TABLE: chama_invite_codes
- id (uuid, PK)
- chama_id (uuid, FK)
- code (text, unique 8-char)
- created_by (uuid, FK to profiles)
- expires_at (timestamp, nullable)
- used_by (uuid, FK to profiles, nullable)
- used_at (timestamp, nullable)
- is_active (boolean, default true)

-- Members table (relevant columns)
TABLE: chama_members
- id (uuid, PK)
- chama_id (uuid, FK)
- user_id (uuid, FK to profiles)
- member_code (text, unique, format: slug-M001)
- order_index (integer, sequential)
- joined_at (timestamp, join date)
- approval_status (enum: pending, approved, rejected)
- is_manager (boolean)
- status (enum: active, inactive)
```

### Database Functions
```sql
-- Generate unique 8-char alphanumeric code
FUNCTION: generate_invite_code() RETURNS text

-- Generate member code based on chama slug and order
FUNCTION: generate_member_code(p_chama_id uuid, p_order_index integer) RETURNS text
```

### RLS Policies
```sql
-- chama_invite_codes
✅ Anyone can view active codes (for validation)
✅ Managers can create invite codes
✅ Managers can update/deactivate codes
✅ Managers can view their chama's codes

-- chama_members
✅ Only chama members can view member details
✅ Managers can update members (approval)
✅ Users can insert themselves with valid code (checked by edge function)
```

## Configuration

### `supabase/config.toml`
```toml
[functions.chama-invite]
verify_jwt = true  # Requires authentication

[functions.chama-join]
verify_jwt = true  # Requires authentication
```

## API Endpoints

### Generate Invite Codes
```bash
POST /chama-invite/generate
Authorization: Bearer <token>
Body: {
  "chama_id": "uuid",
  "count": 10,
  "expires_in_days": null  # Optional
}
Response: { "data": [{ "id", "code", "chama_id", ... }] }
```

### Validate Invite Code
```bash
GET /chama-invite/validate?code=ABC12XYZ
Authorization: Bearer <token>
Response: {
  "valid": true,
  "data": {
    "code": "ABC12XYZ",
    "chama": { "id", "name", "slug", "description", ... }
  }
}
```

### Join Chama
```bash
POST /chama-join
Authorization: Bearer <token>
Body: { "code": "ABC12XYZ" }
Response: {
  "data": { "id", "member_code", "order_index", ... },
  "message": "Join request submitted. Awaiting manager approval."
}
```

### Approve/Reject Join Request
```bash
PUT /chama-join/approve/:member_id
Authorization: Bearer <token>
Body: { "action": "approve" }  # or "reject"
Response: { "data": { ... }, "message": "Join request approved" }
```

## User Flows

### Manager Flow
1. Create chama → Automatically becomes manager with member_code "xxx-M001"
2. Navigate to chama detail page
3. Generate 10 invite codes
4. Share codes via "Copy Link" (creates URL: `/chama/join?code=ABC12XYZ`)
5. View pending join requests when users join
6. Approve or reject requests
7. View approved members with their codes and order indices

### Member Flow
1. Receive invite link from manager
2. Click link → Redirected to `/chama/join?code=ABC12XYZ`
3. Code auto-validated, chama details displayed
4. Click "Submit Join Request"
5. Redirected to chama page with "pending approval" message
6. Wait for manager approval
7. After approval, gain full access to:
   - Member list (with codes and positions)
   - Contribution history
   - Chama details
   - Can make contributions

## Testing

### Acceptance Tests
See `CHAMA_INVITE_ACCEPTANCE_TESTS.md` for comprehensive test suite covering:
- Invite code generation (10 codes)
- Code validation and expiry
- Join request submission
- Manager approval/rejection
- Member privacy and access control
- Order index and member code generation
- Edge cases and error handling

### Quick Manual Test
See `CHAMA_INVITE_QUICK_TEST.md` for step-by-step manual testing guide.

### Test Results
✅ **Manager creates 10 codes**: Passed  
✅ **Users join by code**: Passed  
✅ **join_date recorded**: `joined_at` timestamp set  
✅ **order_index recorded**: Sequential 1, 2, 3...  
✅ **member_code recorded**: Unique codes in correct format  
✅ **Manager approval flow**: Approve/reject working  
✅ **Member privacy**: RLS policies enforcing access control  

## Key Features Demonstrated

### Unique Member Codes
```
Creator:   tech-saves-M001  (order_index: 1, is_manager: true)
Member 2:  tech-saves-M002  (order_index: 2, is_manager: false)
Member 3:  tech-saves-M003  (order_index: 3, is_manager: false)
...
Member 10: tech-saves-M010  (order_index: 10, is_manager: false)
```

### Join Data Recording
```sql
-- Example record after join
{
  "id": "uuid",
  "chama_id": "chama-uuid",
  "user_id": "user-uuid",
  "member_code": "tech-saves-M002",  ✅ Unique code
  "order_index": 2,                   ✅ Sequential order
  "joined_at": "2025-10-09T10:00:00Z", ✅ Join date
  "approval_status": "pending",
  "status": "active",
  "is_manager": false
}
```

## Security Considerations

1. **Authentication Required**: All invite and join operations require valid JWT
2. **Manager-Only Actions**: Code generation and approval restricted to managers
3. **RLS Enforcement**: Database policies prevent unauthorized data access
4. **One-Time Codes**: Codes automatically deactivated after use
5. **No Code Reuse**: Used codes cannot be reused even if member is rejected
6. **Member Privacy**: Non-members cannot see member list or contributions

## Future Enhancements

- [ ] Code expiration management UI
- [ ] Bulk approval for managers
- [ ] Email notifications for join requests
- [ ] WhatsApp integration for invite sharing
- [ ] QR code generation for invite links
- [ ] Analytics: track code usage, join conversion rates
- [ ] Member transfer codes (change order_index)

## Files Modified/Created

### Edge Functions
- ✅ `supabase/functions/chama-invite/index.ts` (updated with auth handling)
- ✅ `supabase/functions/chama-join/index.ts` (updated with auth handling)

### Frontend Components
- ✅ `src/components/ChamaInviteManager.tsx` (updated with auth headers)
- ✅ `src/pages/ChamaJoin.tsx` (updated with auth headers)
- ✅ `src/pages/ChamaDetail.tsx` (integrated invite manager)

### Configuration
- ✅ `supabase/config.toml` (added chama-invite and chama-join functions)

### Documentation
- ✅ `CHAMA_INVITE_ACCEPTANCE_TESTS.md` (comprehensive test suite)
- ✅ `CHAMA_INVITE_QUICK_TEST.md` (manual testing guide)
- ✅ `FEATURE_CHAMA_INVITE.md` (this file)

### Database
- ✅ `chama_invite_codes` table (already exists)
- ✅ `chama_members` table (already exists with required columns)
- ✅ `generate_invite_code()` function (already exists)
- ✅ `generate_member_code()` function (already exists)
- ✅ RLS policies (already configured)

## Branch
Feature branch: `feature/chama-invite` (if using Git workflow)

## Status
✅ **COMPLETE** - All deliverables met, acceptance criteria passed

## Support
For issues or questions about this feature:
1. Check acceptance tests for expected behavior
2. Review edge function logs for errors
3. Verify RLS policies if data access issues
4. Check JWT authentication if API calls fail

---

**Last Updated**: 2025-10-09  
**Feature Owner**: Chama Platform Team  
**Status**: Production Ready ✅
