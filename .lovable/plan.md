

## Redesign Admin Member Search with Full Activity Log

### Problem
The current `AdminSearch` page only searches chama memberships and shows basic profile/group info. It lacks:
- Searching across welfare and organization memberships
- Recent withdrawals and payments history
- Phone number change audit trail
- Full activity log from `audit_logs`
- M-Pesa number (from `payment_methods`)
- ID document photos (`id_front_url`, `id_back_url` from `profiles`)

### Plan

#### 1. New Edge Function: `admin-member-activity`
Create a comprehensive edge function that, given a `user_id`, fetches all activity data in parallel:

- **All memberships**: `chama_members` (with chama name), `welfare_members` (with welfare name)
- **Payment methods**: `payment_methods` where `method_type = 'mpesa'` to get M-Pesa number
- **Recent payments**: Union of `welfare_contributions`, `organization_donations`, `mchango_donations`, and chama `contributions` (last 50)
- **Recent withdrawals**: `withdrawals` table (last 20)
- **Audit logs**: `audit_logs` where `user_id` matches -- captures phone changes, profile updates, all actions
- **Profile with ID photos**: `profiles` including `id_front_url`, `id_back_url`

Returns a single structured response to the frontend.

#### 2. Update `admin-search` Edge Function
Extend search to also check `welfare_members.member_code` and return the `user_id` so the frontend can call `admin-member-activity`.

#### 3. Redesign `AdminSearch.tsx` Page
Professional layout with two phases:

**Phase 1 - Search**: Clean search bar (existing `SearchBar` component, already good).

**Phase 2 - Results Display**: After finding a user, show a professional tabbed dashboard:

- **Header card**: Name, photo placeholder, member code, KYC badge, M-Pesa number, registration date
- **Tab: Memberships**: All chama + welfare memberships with group names, roles, statuses, balances
- **Tab: Payments & Withdrawals**: Chronological table of all payments and withdrawals with source, amount, status, M-Pesa receipt
- **Tab: Activity Log**: Full audit trail from `audit_logs` -- phone changes, profile updates, login history, all actions in a timeline format
- **Tab: ID Documents**: Display `id_front_url` and `id_back_url` images from the profile, with KYC status and review info

#### Files to Edit
1. **Create** `supabase/functions/admin-member-activity/index.ts` -- new edge function
2. **Edit** `supabase/functions/admin-search/index.ts` -- add welfare_members member_code search
3. **Rewrite** `src/pages/AdminSearch.tsx` -- professional redesigned UI
4. **Edit** `supabase/config.toml` -- register new function

### Technical Details

**Edge function `admin-member-activity`** accepts `{ user_id }` via POST. Uses `supabaseAdmin` (service role) to bypass RLS for admin-only data. Runs 6 parallel queries and returns structured JSON.

**Search flow**: Search returns a `user_id`. Frontend then calls `admin-member-activity` with that `user_id` to load the full dashboard. This two-step approach keeps the search fast and the detail view comprehensive.

**Audit log for phone changes**: The existing `audit_logs` table already captures profile updates. The activity tab will filter and highlight entries where `table_name = 'profiles'` and `old_values`/`new_values` contain phone field changes.

