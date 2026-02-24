

## Plan: Add Phone Number to Admin Transactions + Link to User Profile

### What Changes

The `TransactionsTable` currently shows User (name + email), Type, Amount, Reference, Status. You want:

1. **Add phone number column** — Show the phone number used to make the payment alongside the user info
2. **Account lookup** — Check if the phone matches a registered user, and if yes, make it clickable to navigate to the full admin user detail page (`/admin/user/:userId`)
3. **Add search/filter** — Allow searching transactions by phone number

### Specific Changes

**`src/components/admin/TransactionsTable.tsx`** — Major upgrade:

- **Fetch phone from profiles**: Update the Supabase query to include `profiles (full_name, email, phone)` — phone is already on the profiles table, just not being selected
- **Add Phone column** to the table between User and Type
- **Display phone** with a link: If `user_id` exists (registered user), make the phone and name clickable → navigates to `/admin/user/{user_id}` where you can see everything (profile, KYC docs, chamas, transactions, contributions, withdrawals, IPs)
- **Add a search bar** at the top of the table to filter transactions by phone number, name, reference, or type
- **Show M-Pesa receipt** number (`mpesa_receipt_number` column already exists on the table) in the Reference column alongside `payment_reference`
- **Update the Actions column**: Replace the useless `#transaction-{id}` link with a "View User" button that navigates to `/admin/user/{user_id}`

**No database changes needed** — The `transactions` table already has `user_id` → `profiles` (which has `phone`), and `mpesa_receipt_number`. Everything is already in place.

**No edge function changes needed** — All data comes from direct Supabase queries with admin RLS policies already in place.

### How "See Everything" Works

When you click a user's phone/name in the transactions table, you'll go to `/admin/user/{userId}` which already shows:
- Full profile (name, email, phone, ID number, KYC status)
- KYC documents (ID front/back with download)
- All chama memberships
- All mchango campaigns
- All transactions
- All contributions
- All withdrawals
- Login IPs

### Technical Details

- The `profiles` table foreign key from `transactions.user_id` already works with admin RLS (`Admins can view all transactions` policy)
- Phone format is stored as `254XXXXXXXXX` in profiles — will display as `+254XXXXXXXXX`
- Search will be client-side filtering on the 100 loaded transactions (keeps it simple and fast)
- The `mpesa_receipt_number` field on `transactions` table will be shown when available

