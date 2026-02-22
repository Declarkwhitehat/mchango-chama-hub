

# Fix: Navigator LockManager Timeout Error (Persistent)

## Root Cause Analysis

The previous fix addressed the `onAuthStateChange` callback but missed **two other sources** of lock contention:

1. **Session Timeout Polling (lines 124-151):** An `setInterval` calls `supabase.auth.getSession()` every 60 seconds. Each call acquires the Navigator LockManager lock. When this interval fires at the same moment as a login (`setSession`), token auto-refresh, or page load (`getSession`), the locks collide and one times out after 10 seconds.

2. **Redundant with built-in behavior:** Supabase's `autoRefreshToken: true` (already enabled in the client config) automatically handles session refresh and expiry. The manual polling is unnecessary and harmful.

## Solution

### 1. Remove the Session Timeout Polling entirely (AuthContext.tsx)
- Delete the entire second `useEffect` block (lines 123-151) that polls `getSession()` every 60 seconds
- Supabase already auto-refreshes tokens and fires `onAuthStateChange` with `TOKEN_REFRESHED` or `SIGNED_OUT` events when the session expires
- This eliminates the primary source of lock contention

### 2. Handle session expiry via `onAuthStateChange` instead
- Add a check for the `SIGNED_OUT` event inside the existing `onAuthStateChange` listener
- If the event is `TOKEN_REFRESHED` and fails, Supabase automatically signs the user out and fires `SIGNED_OUT`
- Show a toast only when the user is unexpectedly signed out (not when they manually log out)

## Technical Details

The `onAuthStateChange` callback will be updated to:

```typescript
supabase.auth.onAuthStateChange((event, newSession) => {
  if (!mounted) return;
  
  setSession(newSession);
  setUser(newSession?.user ?? null);
  
  if (newSession?.user) {
    setTimeout(() => {
      if (mounted) fetchProfile(newSession.user.id);
    }, 0);
  } else {
    setProfile(null);
    // Show expiry toast only on unexpected sign-out (not manual)
    if (event === 'TOKEN_REFRESHED' && !newSession) {
      toast.error("Your session has expired. Please log in again.");
    }
  }
});
```

The entire session timeout `useEffect` (polling every 60 seconds) will be removed.

## Files Changed
- `src/contexts/AuthContext.tsx` -- remove session timeout polling, rely on built-in Supabase session management

