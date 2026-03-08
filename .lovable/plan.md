

## Problem

When a shared mchango link is opened by a guest user and they try to donate, two issues arise:

1. **Email field adds confusion**: An optional "Email" field is shown to guest users. While technically optional, it creates unnecessary friction and confusion in the donation flow -- guests just need to enter amount, name, and M-Pesa phone number.

2. **No UPDATE RLS policy for guest donations**: After inserting the donation record, the code updates the `payment_reference` with the M-Pesa `CheckoutRequestID` (line 125-128 in DonationForm.tsx). However, there is **no UPDATE policy** on `mchango_donations` for anon or authenticated users. This means the update silently fails, breaking the callback matching flow -- M-Pesa callbacks won't be able to match the payment to the donation.

## Solution

### 1. Remove email field from DonationForm (`src/components/DonationForm.tsx`)
- Remove the email input section entirely (lines 297-309)
- Remove the `email` state variable and its inclusion in `donationData` -- set it from `profile?.email` for logged-in users, `null` for guests
- Remove email from the form reset logic

### 2. Add UPDATE RLS policy on `mchango_donations` (database migration)
- Create an UPDATE policy allowing anon and authenticated users to update only their own donation records
- Restrict updates to the `payment_reference` column scenario: where the donor just inserted (match by `id` and ensure `user_id IS NULL` for anon, or `user_id = auth.uid()` for authenticated)
- This ensures the CheckoutRequestID update succeeds for both guest and logged-in donors

### 3. Streamline the donation data construction
- For logged-in users, auto-fill email from `profile?.email` without showing a field
- Remove email from the form state entirely since it's not user-facing anymore

### Technical Details

**Migration SQL:**
```sql
CREATE POLICY "Donors can update their own pending donations"
ON public.mchango_donations
FOR UPDATE
TO anon, authenticated
USING (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
)
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

GRANT UPDATE ON mchango_donations TO anon;
```

**DonationForm changes:**
- Remove email state, email input UI, and email reset
- Pass `email: user ? (profile?.email || null) : null` directly in `donationData`

