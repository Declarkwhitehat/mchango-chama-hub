# Africa's Talking SMS + OTP Integration

This document describes the complete SMS and OTP verification system integrated into the platform.

## Features Implemented

### 1. OTP Verification System
- **6-digit OTP codes** with 5-minute expiration
- **Rate limiting**: Maximum 3 OTP requests per phone number per hour
- **Attempt tracking**: Maximum 3 verification attempts per OTP
- **Database storage**: OTPs stored securely with expiry tracking

### 2. Phone Verification Flow
- Integrated into the signup process
- Users must verify their phone number before completing registration
- Real-time countdown timer showing OTP expiration
- Resend functionality when OTP expires

### 3. Transactional SMS
SMS notifications are automatically sent for:
- ✅ Account creation success
- ✅ Chama creation confirmation
- ✅ Mchango (campaign) creation confirmation
- Additional templates ready for:
  - Password reset
  - Payment confirmations
  - Withdrawal approvals

## API Endpoints

### Send OTP
**POST** `/functions/v1/send-otp`
```json
{
  "phone": "+254712345678"
}
```
**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 300
}
```

### Verify OTP
**POST** `/functions/v1/verify-otp`
```json
{
  "phone": "+254712345678",
  "otp": "123456",
  "userId": "optional-user-id"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Phone number verified successfully"
}
```

### Send Transactional SMS
**POST** `/functions/v1/send-transactional-sms`
**Requires Authentication**
```json
{
  "phone": "+254712345678",
  "message": "Your custom message here",
  "eventType": "registration" // optional
}
```
**Response:**
```json
{
  "success": true,
  "message": "SMS sent successfully",
  "messageId": "ATXid_xxxxx"
}
```

## Usage in Code

### Send OTP
```typescript
import { sendOTP } from "@/utils/smsService";

const result = await sendOTP("+254712345678");
if (result.success) {
  console.log("OTP sent!");
}
```

### Verify OTP
```typescript
import { verifyOTP } from "@/utils/smsService";

const result = await verifyOTP("+254712345678", "123456", userId);
if (result.success) {
  console.log("Phone verified!");
}
```

### Send Transactional SMS
```typescript
import { sendTransactionalSMS, SMS_TEMPLATES } from "@/utils/smsService";

// Using a template
await sendTransactionalSMS(
  phone,
  SMS_TEMPLATES.accountCreated(userName),
  'registration'
);

// Custom message
await sendTransactionalSMS(
  phone,
  "Your custom message",
  'custom_event'
);
```

## SMS Templates

Pre-defined templates are available in `src/utils/smsService.ts`:

- `accountCreated(name)` - Welcome message after registration
- `chamaCreated(chamaName)` - Chama creation confirmation
- `mchangoCreated(mchangoTitle)` - Campaign creation confirmation
- `passwordReset(code)` - Password reset code
- `paymentReceived(amount, reference)` - Payment confirmation
- `withdrawalApproved(amount)` - Withdrawal approval notification

## Database Schema

### OTP Verifications Table
```sql
CREATE TABLE otp_verifications (
  id UUID PRIMARY KEY,
  phone TEXT NOT NULL,
  otp TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3
);
```

### Profile Updates
The `profiles` table has been extended with:
- `phone_verified` - Boolean flag for phone verification status
- `phone_otp_verified` - Boolean flag for OTP verification completion

## Security Features

### Rate Limiting
- Maximum 3 OTP requests per phone number per hour
- Prevents SMS spam and abuse

### Attempt Tracking
- Maximum 3 verification attempts per OTP
- Forces users to request new OTP after failed attempts

### Automatic Cleanup
- Expired OTPs are cleaned up automatically
- OTPs older than 24 hours are removed from database

### Phone Number Validation
- International format required (+254712345678)
- Regex validation: `^\+\d{10,15}$`

## Configuration

### Environment Variables (Already Configured)
- `AFRICASTALKING_API_KEY` - Your Africa's Talking API key
- `AFRICASTALKING_USERNAME` - Your Africa's Talking username

### Edge Function Configuration
The following edge functions are configured in `supabase/config.toml`:
- `send-otp` - Public (no JWT required)
- `verify-otp` - Public (no JWT required)
- `send-transactional-sms` - Protected (JWT required)

## Integration Points

### 1. Signup Flow (`src/pages/Auth.tsx`)
- Two-step registration process
- Step 1: Enter user details
- Step 2: Verify phone number with OTP
- Welcome SMS sent after successful registration

### 2. Chama Creation (`src/pages/ChamaCreate.tsx`)
- SMS confirmation sent after Chama is created
- Includes Chama name in the message

### 3. Mchango Creation (`src/pages/MchangoCreate.tsx`)
- SMS confirmation sent after campaign is created
- Includes campaign title in the message

## UI Components

### PhoneVerification Component
Located at `src/components/PhoneVerification.tsx`

Features:
- Phone input with international format validation
- OTP input with 6-digit slots
- Countdown timer (5 minutes)
- Resend functionality
- Loading states
- Error handling

## Testing

### Phone Number Format
Always use international format:
- ✅ Correct: `+254712345678`
- ❌ Wrong: `0712345678`
- ❌ Wrong: `254712345678`

### Testing OTP Flow
1. Enter phone number in signup
2. Click "Send OTP"
3. Check your phone for the 6-digit code
4. Enter the code within 5 minutes
5. Complete registration

## Error Handling

Common errors and solutions:

### "Invalid phone number format"
- Ensure phone number starts with `+` and country code
- Example: `+254712345678`

### "Too many OTP requests"
- Wait 1 hour before requesting another OTP
- Rate limit: 3 requests per hour per phone number

### "Maximum verification attempts exceeded"
- Request a new OTP
- Each OTP allows 3 verification attempts

### "OTP expired"
- OTPs expire after 5 minutes
- Click "Resend" to get a new code

## Future Enhancements

Potential additions:
- Password reset with OTP
- Two-factor authentication (2FA)
- Payment notifications via SMS
- Reminder SMS for due contributions
- Bulk SMS for group notifications

## Support

For issues related to SMS delivery:
1. Check Africa's Talking dashboard for SMS logs
2. Verify API credentials are correct
3. Ensure phone number is in correct format
4. Check account balance on Africa's Talking

For technical issues:
1. Check edge function logs in Lovable Cloud dashboard
2. Review browser console for errors
3. Verify database OTP records

## API Rate Limits

Africa's Talking rate limits:
- Check your plan's SMS limit
- Monitor usage in Africa's Talking dashboard
- Consider upgrading if approaching limits
