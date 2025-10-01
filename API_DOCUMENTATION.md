# Chama & Mchango Platform - API Documentation

## Overview
This document provides API documentation for the authentication and KYC verification system.

## Authentication Flow

### 1. User Registration (Sign Up)
**Endpoint:** Handled by Lovable Cloud Auth  
**Method:** POST  
**Fields:**
- `email` (string, required): Valid email address, max 255 characters
- `password` (string, required): Minimum 8 characters, must include uppercase, lowercase, number, and special character
- `full_name` (string, required): User's full name, 2-100 characters
- `id_number` (string, required): National ID number, 5-50 characters, must be unique
- `phone` (string, required): Phone number in E.164 format (e.g., +254712345678)

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "user_metadata": {
      "full_name": "John Doe",
      "id_number": "12345678",
      "phone": "+254712345678"
    }
  }
}
```

**Automatic Actions:**
- Creates user in `auth.users` table
- Triggers `handle_new_user()` function which:
  - Creates profile record in `profiles` table
  - Assigns 'user' role in `user_roles` table
  - Sets initial `kyc_status` to 'pending'

### 2. User Login
**Endpoint:** Handled by Lovable Cloud Auth  
**Method:** POST  
**Fields:**
- `email` (string, required)
- `password` (string, required)

**Response:**
```json
{
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "user": { "id": "uuid", "email": "user@example.com" }
  }
}
```

## KYC Verification Flow

### 3. Upload KYC Documents
**Process:**
1. User uploads ID front and back images
2. Images stored in `id-documents` storage bucket under `{user_id}/` folder
3. Profile updated with document URLs and submission timestamp

**Storage Structure:**
```
id-documents/
  {user_id}/
    id-front-{timestamp}.jpg
    id-back-{timestamp}.jpg
```

**Profile Updates:**
```json
{
  "id_front_url": "https://storage.url/id-front.jpg",
  "id_back_url": "https://storage.url/id-back.jpg",
  "kyc_submitted_at": "2025-10-01T10:00:00Z",
  "kyc_status": "pending"
}
```

**File Requirements:**
- Format: JPG, PNG, or other image formats
- Max size: 5MB per file
- Both front and back required

### 4. Admin KYC Review
**Admin Actions:**

#### Approve KYC
```sql
UPDATE profiles SET
  kyc_status = 'approved',
  kyc_reviewed_at = NOW(),
  kyc_reviewed_by = {admin_user_id}
WHERE id = {user_id};
```

#### Reject KYC
```sql
UPDATE profiles SET
  kyc_status = 'rejected',
  kyc_reviewed_at = NOW(),
  kyc_reviewed_by = {admin_user_id},
  kyc_rejection_reason = 'Reason for rejection'
WHERE id = {user_id};
```

## Database Schema

### profiles Table
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  id_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  kyc_status kyc_status NOT NULL DEFAULT 'pending', -- ENUM: 'pending', 'approved', 'rejected'
  id_front_url TEXT,
  id_back_url TEXT,
  kyc_submitted_at TIMESTAMP WITH TIME ZONE,
  kyc_reviewed_at TIMESTAMP WITH TIME ZONE,
  kyc_reviewed_by UUID REFERENCES auth.users(id),
  kyc_rejection_reason TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

### user_roles Table
```sql
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL, -- ENUM: 'admin', 'user'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
```

## Row Level Security (RLS) Policies

### profiles Table Policies
1. **Users can view own profile:**
   ```sql
   USING (auth.uid() = id)
   ```

2. **Users can update own profile:**
   ```sql
   USING (auth.uid() = id)
   ```

3. **Admins can view all profiles:**
   ```sql
   USING (public.has_role(auth.uid(), 'admin'))
   ```

4. **Admins can update all profiles:**
   ```sql
   USING (public.has_role(auth.uid(), 'admin'))
   ```

### Storage Policies (id-documents bucket)
1. **Users can upload their own documents:**
   ```sql
   bucket_id = 'id-documents' AND 
   auth.uid()::text = (storage.foldername(name))[1]
   ```

2. **Users can view their own documents:**
   ```sql
   bucket_id = 'id-documents' AND 
   auth.uid()::text = (storage.foldername(name))[1]
   ```

3. **Admins can view all documents:**
   ```sql
   bucket_id = 'id-documents' AND 
   public.has_role(auth.uid(), 'admin')
   ```

## Access Control

### Protected Routes
- `/home` - Requires authentication
- `/profile` - Requires authentication
- `/mchango/create` - Requires authentication + KYC approved
- `/chama/create` - Requires authentication + KYC approved
- `/admin/*` - Requires authentication + admin role

### KYC Status Checks
```typescript
// Check if user can create Mchango/Chama
if (!profile.kyc_submitted_at) {
  // Redirect to /kyc-upload
}

if (profile.kyc_status !== 'approved') {
  // Show error: "Your KYC status is {status}. Only approved users can create campaigns."
}
```

## SMS/Email OTP (Future Implementation)

### Send OTP Edge Function
**Endpoint:** `/functions/v1/send-otp`  
**Method:** POST  
**Public:** Yes (no JWT required)

**Request:**
```json
{
  "phone": "+254712345678",
  "type": "sms" // or "email"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "otp": "123456" // Only in development mode
}
```

**Implementation Notes:**
- Currently returns success without actual sending
- TODO: Integrate with Twilio or Africa's Talking for SMS
- TODO: Integrate with email service (Resend) for email OTP
- TODO: Store OTP in database with expiry time
- TODO: Create verify-otp endpoint

## Security Features

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Input Validation
All forms use Zod schema validation:
- Email format validation
- Phone number E.164 format validation
- Password strength validation
- ID number uniqueness validation

### Data Encryption
- ID documents stored in private storage bucket
- Only authenticated users can access their own documents
- Admins have read-only access to all documents for review
- All passwords hashed by Lovable Cloud Auth

## Error Handling

### Common Errors
- `"Email already registered"` - User tried to sign up with existing email
- `"Invalid email or password"` - Login credentials incorrect
- `"Access denied: Admin privileges required"` - Non-admin accessing admin routes
- `"Please complete KYC verification first"` - User trying to create campaign without KYC
- `"Your KYC status is {status}. Only approved users can access this feature."` - User with pending/rejected KYC

## Testing

### Creating Test Admin User
```sql
-- After creating a user through the app, run this SQL to make them admin:
INSERT INTO public.user_roles (user_id, role)
VALUES ('{user_uuid}', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

### Test Data
The system includes mock data in the UI for:
- User profiles
- Campaign statistics
- Recent activities

## Deployment Notes

1. **Database Migrations:** All migrations are automatically applied
2. **Edge Functions:** Auto-deployed with code changes
3. **Environment:** Auto-confirm email is enabled for easier testing
4. **Storage:** id-documents bucket is private (not publicly accessible)

## Future Enhancements

- [ ] SMS OTP integration (Twilio/Africa's Talking)
- [ ] Email OTP integration (Resend)
- [ ] Phone number verification flow
- [ ] Email verification flow
- [ ] Document OCR for automated ID verification
- [ ] Facial recognition for enhanced KYC
- [ ] KYC document expiry notifications
- [ ] Audit log for all KYC actions
