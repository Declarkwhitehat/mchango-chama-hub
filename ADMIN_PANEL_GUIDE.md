# Admin Panel & Search - User Guide

## Overview
Comprehensive admin dashboard for managing users, KYC verifications, transactions, audit logs, and performing system-wide searches.

## Access
**URL**: `/admin` or `/admin/dashboard`  
**Required**: Admin role in `user_roles` table

## Features

### 1. Universal Search
**Location**: Admin Dashboard (`/admin/dashboard`)

**Search Types**:
- **All**: Searches across all entities
- **User**: By name, phone, ID number, or email
- **Member Code**: Find chama members by their unique codes
- **Mchango Slug**: Search mchango campaigns
- **Transaction ID**: Find specific transactions
- **Email**: Search users by email
- **Phone**: Search users by phone

**How to Use**:
1. Select search type from dropdown
2. Enter search query
3. Click "Search" or press Enter
4. View categorized results
5. Click "View" buttons to navigate to details

**Example Searches**:
- Search "tech-savers-M003" with type "Member Code"
- Search "john@example.com" with type "Email"
- Search "donate-for-school" with type "Mchango Slug"
- Search transaction reference with type "Transaction ID"

### 2. KYC Verification
**Location**: `/admin/kyc`

**Features**:
- View all KYC submissions (pending, approved, rejected)
- **View ID Images**: Both front and back of ID documents
- Approve or reject submissions
- Require rejection reason for audit trail
- Filter by status

**Workflow**:
1. Click "Review" on any submission
2. **View ID Images**: Both sides displayed side-by-side
3. Verify information matches ID
4. Either:
   - **Approve**: Click green "Approve" button
   - **Reject**: Enter rejection reason, click red "Reject" button
5. Decision is recorded with audit trail

**ID Image Display Fix**:
- Now correctly extracts path from storage URL
- Creates signed URLs for secure viewing
- Click images to open full-size in new tab
- 1-hour expiry on signed URLs

### 3. Transactions Management
**Location**: Admin Dashboard > Transactions Tab

**Features**:
- View all platform transactions (last 100)
- Filter by status, type, date
- Export to CSV
- View transaction details
- Link to related entities

**Columns**:
- Date
- User (name + email)
- Type (donation, contribution, payout)
- Amount
- Reference
- Status

**CSV Export**:
1. Click "Export CSV" button
2. Downloads: `transactions_YYYY-MM-DD.csv`
3. Includes all fields with proper formatting

### 4. Audit Logs
**Location**: Admin Dashboard > Audit Logs Tab

**Features**:
- View all system actions (INSERT, UPDATE, DELETE)
- Track who did what and when
- IP address tracking
- Record ID tracking
- Automatic logging for critical operations

**Information Displayed**:
- Timestamp
- Action (INSERT/UPDATE/DELETE)
- Table name
- User ID (or "System")
- IP address
- Record ID

### 5. Account Adjustment
**Location**: Admin Dashboard > Account Adjustment Tab

**Purpose**: Manually credit or debit user accounts

**Features**:
- Credit (add funds) or Debit (remove funds)
- Requires reason for audit trail
- Creates transaction record
- Logs to audit_logs table

**Workflow**:
1. Enter User ID (UUID)
2. Select Type: Credit or Debit
3. Enter Amount (KES)
4. Enter Reason (required for audit)
5. Click "Credit Account" or "Debit Account"
6. Confirmation toast appears

**Audit Trail**:
- All adjustments logged
- Reason recorded
- Transaction created with reference `ADMIN-{timestamp}`
- Viewable in Audit Logs and Transactions

## Navigation

### From Main Admin Page (`/admin`):
- **Stats Overview**: Total users, pending KYC, campaigns, groups, funds
- **KYC Queue Tab**: Button to open KYC review page
- **Advanced Search Button**: Opens full admin dashboard
- **Users Tab**: User management
- **Campaigns Tab**: Mchango management
- **Groups Tab**: Chama management

### Admin Dashboard (`/admin/dashboard`):
- **Universal Search**: Top section, always visible
- **Search Results**: Dynamic display below search
- **Management Tabs**: 
  - Transactions
  - Audit Logs
  - Account Adjustment

## Search Results Display

### Users Results
Shows:
- Full name
- Email
- ID number and phone
- KYC status badge
- "View KYC" button

### Members Results
Shows:
- Member code
- User name
- Chama name
- "View Chama" button

### Mchangos Results
Shows:
- Title
- Slug
- Amount raised / target
- "View" button

### Transactions Results
Shows:
- Amount
- Payment reference
- User name
- Date
- Status badge

## CSV Export Formats

### Transactions Export
Columns:
```
ID, Date, User Name, Email, Amount, Type, Payment Method, Reference, Status
```

### Members Export
Columns:
```
Member Code, Name, Email, Phone, Chama, Joined Date, Order Index, Status, Is Manager
```

**How to Export**:
1. Navigate to Transactions table
2. Click "Export CSV" button
3. Wait for download
4. Open in Excel/Sheets

## Security Features

### Authentication
- Requires admin role in `user_roles` table
- JWT verification on all endpoints
- Session validation

### Authorization
- All edge functions check for admin role
- Row-level security (RLS) on database
- Audit logging for all admin actions

### Audit Trail
- Every admin action logged
- IP address tracking
- User ID tracking
- Reason required for account adjustments
- Immutable audit log entries

## Edge Functions

### admin-search
**Endpoint**: `/functions/v1/admin-search`  
**Method**: POST  
**Auth**: Required (admin role)

**Body**:
```json
{
  "query": "search term",
  "type": "all" | "user" | "member_code" | "mchango_slug" | "transaction_id" | "email" | "phone"
}
```

**Response**:
```json
{
  "data": {
    "users": [...],
    "members": [...],
    "mchangos": [...],
    "chamas": [...],
    "transactions": [...]
  }
}
```

### admin-export
**Endpoint**: `/functions/v1/admin-export`  
**Method**: POST  
**Auth**: Required (admin role)

**Body**:
```json
{
  "type": "transactions" | "members"
}
```

**Response**:
```json
{
  "csv": "ID,Date,User Name,...\ndata,data,data..."
}
```

## Common Tasks

### Verify KYC Submission
1. Go to `/admin/kyc`
2. Click "Review" on pending submission
3. **Check ID images** (both front and back)
4. Verify name, ID number match
5. Approve or reject with reason

### Search for User
1. Go to `/admin/dashboard`
2. Select "User" from dropdown
3. Enter name, email, phone, or ID number
4. Click Search
5. View results and click "View KYC"

### Find Transaction
1. Go to `/admin/dashboard`
2. Select "Transaction ID" from dropdown
3. Enter payment reference or transaction ID
4. Click Search
5. View transaction details

### Export Data
1. Go to `/admin/dashboard`
2. Click "Transactions" tab
3. Click "Export CSV"
4. Save downloaded file
5. Repeat for members if needed

### Credit User Account
1. Go to `/admin/dashboard`
2. Click "Account Adjustment" tab
3. Enter user ID
4. Select "Credit (Add)"
5. Enter amount
6. Enter reason: "Bonus for early adoption"
7. Click "Credit Account"

## Troubleshooting

### KYC Images Not Loading
**Fixed**: Images now load correctly by extracting path from storage URL
**If still issues**:
- Check browser console for errors
- Verify images exist in `id-documents` bucket
- Check storage RLS policies

### Search Returns No Results
- Verify exact spelling
- Try different search type
- Check if data exists in database
- Use "All" type for broader search

### Export Fails
- Check admin role is assigned
- Verify session is active
- Check browser console for errors
- Try again with smaller dataset

### Cannot Access Admin Panel
- Verify admin role in `user_roles` table:
  ```sql
  SELECT * FROM user_roles WHERE user_id = '{your_id}' AND role = 'admin';
  ```
- If no role, add one:
  ```sql
  INSERT INTO user_roles (user_id, role) VALUES ('{your_id}', 'admin');
  ```

## Database Queries

### Check Admin Status
```sql
SELECT ur.role, p.full_name, p.email
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin';
```

### View Recent Audit Logs
```sql
SELECT 
  action,
  table_name,
  user_id,
  created_at,
  new_values
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;
```

### Find Pending KYC
```sql
SELECT 
  full_name,
  email,
  kyc_status,
  kyc_submitted_at
FROM profiles
WHERE kyc_status = 'pending'
AND kyc_submitted_at IS NOT NULL
ORDER BY kyc_submitted_at ASC;
```

### Transaction Summary
```sql
SELECT 
  COUNT(*) as total_transactions,
  SUM(amount) as total_amount,
  transaction_type,
  status
FROM transactions
GROUP BY transaction_type, status;
```

## Best Practices

1. **Always provide rejection reason** when rejecting KYC
2. **Check ID images carefully** before approving
3. **Use search** before manual database queries
4. **Export data regularly** for backup
5. **Review audit logs** weekly for anomalies
6. **Document account adjustments** with clear reasons
7. **Verify user identity** before manual adjustments

## Keyboard Shortcuts

- `Enter` in search box: Submit search
- Click image: Open full-size in new tab
- `Tab` through form fields: Navigate forms

## Support

### For Users
- Direct them to contact support email
- Do not share admin panel access

### For Admins
- Check `ADMIN_SETUP_GUIDE.md` for setup
- Review `FEATURE_CHAMA_INVITE.md` for invite system
- See `COMMISSION_DISPLAY_TESTS.md` for commission rules

## Updates

- ✅ ID image display fixed (path extraction)
- ✅ Universal search implemented
- ✅ CSV export for transactions and members
- ✅ Audit logs tracking
- ✅ Account adjustment with audit trail
- ✅ Signed URLs for secure image viewing

## Notes

- All admin actions are logged
- Audit logs are immutable
- CSV exports are limited to prevent timeouts
- Search is limited to 20 results per category
- Signed URLs expire after 1 hour
- Transaction types use existing enums (donation/payout)
