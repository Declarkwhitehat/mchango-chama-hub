

## Fix IP Address Recording

### Problem
All IP addresses in the admin dashboard show as "N/A" because:
1. The `capture-login-ip` edge function exists but is **never called** from the frontend after login or signup
2. Database triggers that create audit logs don't have access to client IP addresses (PostgreSQL triggers can't see HTTP headers)

### Solution

#### 1. Call `capture-login-ip` after successful login
In `src/contexts/AuthContext.tsx`, after `supabase.auth.setSession(responseData.session)` succeeds (line 179), call the `capture-login-ip` edge function with `{ is_signup: false }`.

#### 2. Call `capture-login-ip` after successful signup
In `src/contexts/AuthContext.tsx`, after `supabase.auth.signUp()` succeeds, call the `capture-login-ip` edge function with `{ is_signup: true }`.

#### 3. Capture IP in the login edge function and write to audit logs
Update `supabase/functions/login/index.ts` to record the client IP in the audit_logs table after a successful login, using the service role client so the IP is persisted.

#### 4. Call `capture-login-ip` after 2FA verification
In `src/pages/Auth.tsx`, after successful 2FA verification and session setup, also call the `capture-login-ip` function.

### Technical Details

**File: `src/contexts/AuthContext.tsx`**
- Add a helper function `captureLoginIP(session, isSignup)` that calls the `capture-login-ip` edge function
- Call it after line 179 (successful login without 2FA)
- Call it after successful signup (line 189-196)

**File: `src/pages/Auth.tsx`**
- After 2FA is verified and session is set, call `capture-login-ip`

**File: `supabase/functions/login/index.ts`**
- After successful authentication (line ~133), insert an audit log entry with the client IP using the service role client

This ensures every login and signup records the user's IP address both in the `profiles` table (via the edge function) and in the `audit_logs` table.

