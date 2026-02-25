

# Fix Welfare System - Root Cause Analysis and Plan

## Issues Found

### 1. Missing Foreign Key: `welfare_members.user_id` → `profiles.id`
**This is the primary failure.** The edge function logs show:
```
Could not find a relationship between 'welfare_members' and 'user_id' in the schema cache
```
The migration created `welfare_members.user_id` as a plain uuid column with no FK reference to `profiles(id)`. PostgREST needs this FK to resolve the embedded join syntax `profiles:user_id(full_name, phone)` used in `welfare-crud`, `welfare-members`, `welfare-contributions`, and `welfare-withdrawal-approve`.

The same issue exists for `welfare_contributions.user_id` and `welfares.created_by`.

### 2. RLS Blocks Welfare Creation
The `welfares` table has an INSERT policy requiring KYC approval:
```sql
WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND kyc_status = 'approved'))
```
The `welfare-crud` function uses `supabaseClient` (user-context) to insert, which enforces RLS. If the user hasn't completed KYC, creation fails silently. The function should use `supabaseAdmin` for the insert (after validating auth), matching the pattern used by other entity creation functions.

### 3. `welfare-contributions` Uses `supabaseClient` for Insert
Same RLS issue -- the contribution insert uses `supabaseClient` which enforces RLS. The user may not satisfy the `is_welfare_member` check through PostgREST because member status is checked via a security definer function that may not resolve correctly with the client context. Should use `supabaseAdmin` after manual auth validation.

### 4. `welfare-contributions` Balance Update Race Condition
Line 118-123 reads the welfare balance values from the initial query (line 59-63) and adds to them. But `welfare.total_gross_collected` etc. are from the initial `welfare` variable which doesn't have those fields selected. The select only gets `id, is_frozen, status, commission_rate`. The update will set balances to `undefined + amount = NaN`.

### 5. `welfare-withdrawal-approve` FK Join Issues
The function uses `welfare_members!approver_id(user_id, role)` and `withdrawals!withdrawal_id(...)` with `profiles:requested_by(...)` -- these all need proper FK relationships. The `welfare_withdrawal_approvals.approver_id` references `welfare_members(id)` which exists, but the nested `profiles:requested_by` on withdrawals requires a FK from `withdrawals.requested_by` to `profiles.id`.

### 6. Config.toml Missing Welfare Function Entries
No `[functions.welfare-crud]`, `[functions.welfare-members]`, etc. entries exist in config.toml. They default to `verify_jwt = true`, which means the Supabase gateway validates JWT before the function code runs. Since these functions handle auth manually, they need `verify_jwt = false`.

## Fix Plan

### Database Migration
Add missing foreign keys:
- `welfare_members.user_id` → `profiles(id)`
- `welfare_contributions.user_id` → `profiles(id)`
- `welfares.created_by` → `profiles(id)`

### Edge Function Fixes

**`welfare-crud/index.ts`:**
- Use `supabaseAdmin` for INSERT (bypass KYC RLS requirement)
- Use `supabaseAdmin` for GET queries that need FK joins with profiles
- After insert, auto-create chairman member using `supabaseAdmin` (in case trigger doesn't fire via admin client)

**`welfare-members/index.ts`:**
- Use `supabaseAdmin` for INSERT (join operation) since the `profiles:user_id` join needs FK
- Use `supabaseAdmin` for all queries involving profile joins

**`welfare-contributions/index.ts`:**
- Fix balance update: select all balance fields in the initial welfare query
- Use `supabaseAdmin` for contribution insert (bypass RLS complexity)
- Fix `member.total_contributed` -- the initial member query doesn't select `total_contributed`

**`welfare-cycles/index.ts`:**
- Use `supabaseAdmin` for cycle insert (the RLS requires `is_welfare_secretary` which was already verified manually)

**`welfare-withdrawal-approve/index.ts`:**
- Already uses `supabaseAdmin` for most operations -- verify FK joins work

### Frontend Fixes
- `WelfareDetail.tsx`: The `supabase.functions.invoke(\`welfare-crud/${id}\`)` call appends the ID to the function path. This should work but needs the function to parse the path correctly (already does).

### Config.toml
Add entries for all 5 welfare functions with `verify_jwt = false`.

## Implementation Summary

1. **Migration**: Add 3 FK constraints
2. **5 edge functions**: Fix to use `supabaseAdmin` for writes and FK-joined reads; fix balance update bug
3. **Config.toml**: Add welfare function entries
4. **No frontend changes needed** -- the UI code is correct, the issues are all backend

## Technical Details

The fixes follow the exact same pattern used by the working `chama-crud`, `mchango-crud`, and `contributions-crud` functions which all use `supabaseAdmin` for data mutations and queries involving profile joins.

