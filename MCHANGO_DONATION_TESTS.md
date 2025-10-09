# Mchango Donation Flow Testing Guide

## Overview
This guide covers testing the donation flow for Mchango campaigns, including guest donations, registered user donations, anonymity options, and commission calculations.

## Prerequisites
- M-Pesa test credentials configured (`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`)
- At least one active Mchango campaign in the database
- Access to M-Pesa sandbox for testing payments

## Test Scenarios

### 1. Guest Donation (Named)

**Steps:**
1. Navigate to `/mchango` (campaign listing page)
2. Click on any active campaign
3. In the "Make a Donation" form:
   - Enter amount: `1000`
   - Enter display name: `John Guest`
   - Enter phone: `254712345678`
   - Enter email (optional): `john@example.com`
   - Keep "Donate anonymously" unchecked
4. Click "Donate Now"
5. Complete M-Pesa STK push on phone

**Expected Results:**
- STK push initiated successfully
- Toast notification: "Payment Initiated - Please check your phone to complete the payment"
- After payment completion:
  - Donation appears in Contributors list as "John Guest"
  - Total Collected increases by KES 1,000
  - Commission (15%) = KES 150
  - Net Balance = KES 850 (if this was first donation)

### 2. Guest Donation (Anonymous)

**Steps:**
1. Navigate to active Mchango campaign detail page
2. In the donation form:
   - Enter amount: `500`
   - Enter display name: `Jane Doe` (will be hidden)
   - Enter phone: `254723456789`
   - Check "Donate anonymously"
4. Click "Donate Now"
5. Complete M-Pesa payment

**Expected Results:**
- Payment processed successfully
- Contributor shows as "Anonymous" in the list
- Real name and contact saved in database (for records)
- Amount and totals updated correctly

**Database Verification:**
```sql
SELECT 
  id, 
  display_name, 
  phone, 
  email, 
  amount, 
  is_anonymous, 
  payment_status
FROM mchango_donations
WHERE is_anonymous = true
ORDER BY created_at DESC
LIMIT 1;
```

### 3. Registered User Donation

**Steps:**
1. Login as registered user
2. Navigate to campaign detail page
3. In donation form:
   - Amount: `2000`
   - Phone: `254734567890` (pre-filled from profile)
   - Anonymity: unchecked
4. Click "Donate Now"
5. Complete payment

**Expected Results:**
- User's full name from profile appears in contributors
- `user_id` field populated in database
- All financial calculations correct

### 4. Commission Calculation Test

**Test Data:**
Create donations with these amounts:
- Donation 1: KES 1,000
- Donation 2: KES 2,000
- Donation 3: KES 5,000

**Expected Financial Summary:**
```
Total Collected: KES 8,000
Commission (15%): KES 1,200
Net Balance: KES 6,800
```

**Verification:**
1. Check Financial Summary card on campaign page
2. All three values should be displayed
3. Calculation: Net Balance = Total - (Total × 0.15)

### 5. Contributors List Test

**Steps:**
1. Create multiple donations (mix of guest and registered, anonymous and named)
2. Verify contributor list shows:
   - Numbered entries (1, 2, 3, ...)
   - Display names (or "Anonymous")
   - Individual amounts
   - Relative time stamps ("2 minutes ago", "1 hour ago")

**Expected Display:**
```
Contributors (5)

1. John Doe           KES 1,000
   2 minutes ago

2. Anonymous          KES 500
   5 minutes ago

3. Jane Smith         KES 2,000
   10 minutes ago
```

### 6. Real-time Updates Test

**Steps:**
1. Open campaign detail page in Browser A
2. Open same campaign in Browser B
3. Make donation in Browser B
4. Observe Browser A (should update automatically)

**Expected Results:**
- Contributors list updates without page refresh
- Total amounts update in real-time
- Commission and net balance recalculate automatically

### 7. Edge Cases

#### Empty Phone Number (Guest)
- Try to donate without entering phone
- Expected: Error toast "Phone Required - Please provide your phone number"

#### Zero/Negative Amount
- Enter amount: `0` or `-100`
- Expected: Error toast "Invalid Amount - Please enter a valid donation amount"

#### Campaign Not Found
- Navigate to `/mchango/invalid-slug`
- Expected: Redirect to `/mchango` with error toast

#### Payment Failure
- Initiate payment but cancel on M-Pesa prompt
- Expected: Donation remains in "pending" status
- Does not appear in contributors list (only completed payments shown)

## Database Queries for Testing

### View All Donations for a Campaign
```sql
SELECT 
  d.id,
  d.display_name,
  d.phone,
  d.amount,
  d.is_anonymous,
  d.payment_status,
  d.created_at,
  m.title as campaign_title
FROM mchango_donations d
JOIN mchango m ON m.id = d.mchango_id
WHERE d.mchango_id = '<CAMPAIGN_ID>'
ORDER BY d.created_at DESC;
```

### Check Total Amounts
```sql
SELECT 
  m.title,
  m.target_amount,
  m.current_amount,
  COUNT(d.id) as donation_count,
  SUM(d.amount) as total_donations
FROM mchango m
LEFT JOIN mchango_donations d ON d.mchango_id = m.id 
  AND d.payment_status = 'completed'
WHERE m.id = '<CAMPAIGN_ID>'
GROUP BY m.id;
```

### Verify Anonymous Donations Stored Correctly
```sql
SELECT 
  display_name as shown_name,
  phone as real_phone,
  email as real_email,
  is_anonymous,
  amount
FROM mchango_donations
WHERE is_anonymous = true
  AND payment_status = 'completed';
```

## API Testing with Postman

### Create Donation (Guest)
```http
POST {{SUPABASE_URL}}/rest/v1/mchango_donations
Authorization: Bearer {{ANON_KEY}}
Content-Type: application/json

{
  "mchango_id": "{{MCHANGO_ID}}",
  "display_name": "Test Donor",
  "phone": "254712345678",
  "email": "test@example.com",
  "amount": 1000,
  "is_anonymous": false,
  "payment_reference": "TEST-REF-123",
  "payment_method": "mpesa",
  "payment_status": "pending"
}
```

### Get Campaign Donations
```http
GET {{SUPABASE_URL}}/rest/v1/mchango_donations?mchango_id=eq.{{MCHANGO_ID}}&payment_status=eq.completed
Authorization: Bearer {{ANON_KEY}}
```

## Demo Script

### Guest Donation with Anonymity
```
Narrator: "Let's demonstrate how a guest user can make an anonymous donation."

1. [Open campaign page] "This is the Mchango campaign detail page"
2. [Scroll to donation form] "Here we have the donation form"
3. [Enter amount] "I'll donate KES 1,000"
4. [Enter guest info] "As a guest, I provide my name and phone"
5. [Check anonymous] "But I want to stay anonymous, so I check this box"
6. [Click Donate] "Now I click Donate Now"
7. [Show phone] "I receive an M-Pesa prompt on my phone"
8. [Complete payment] "After completing payment..."
9. [Show contributors] "My donation appears as 'Anonymous' in the list"
10. [Show summary] "The financial summary updates showing:"
    - Total Collected: KES 1,000
    - Commission (15%): KES 150
    - Net Balance: KES 850
```

## Acceptance Criteria Checklist

- [ ] Guest users can donate with minimal info (name, phone, optional email)
- [ ] Registered users can donate using their account info
- [ ] Anonymity option works (displays "Anonymous" but stores real info)
- [ ] M-Pesa STK Push integration works
- [ ] Donations create contribution records linked to mchango
- [ ] 15% commission automatically deducted
- [ ] Financial summary displays correctly:
  - Total Collected
  - Commission (15%)
  - Net Balance
- [ ] Contributors list shows:
  - Numbered rows
  - Display names (or Anonymous)
  - Individual amounts
  - Timestamps
- [ ] Real-time updates work (new donations appear automatically)
- [ ] Only completed payments appear in contributors list
- [ ] Campaign's current_amount updates when donation completes

## Troubleshooting

### Donations Not Appearing
- Check payment_status is 'completed'
- Verify RLS policies allow SELECT on mchango_donations
- Check browser console for errors

### Commission Calculation Wrong
- Verify COMMISSION_RATE = 0.15 in DonorsList component
- Check totalAmount prop is correct number type
- Ensure toLocaleString() not affecting calculations

### Real-time Not Working
- Check Supabase realtime is enabled
- Verify channel subscription is active
- Check browser console for subscription errors

## Support
For issues or questions, consult:
- `src/components/DonationForm.tsx` - Donation form logic
- `src/components/DonorsList.tsx` - Contributors display and commission calc
- `supabase/functions/mpesa-stk-push/index.ts` - Payment initiation
- `supabase/functions/mpesa-callback/index.ts` - Payment completion handler
