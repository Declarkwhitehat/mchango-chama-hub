## Goal
Make create-flows clearly communicate requirements across the whole platform:
1. If the user is **not logged in** and taps any "Create" action (New Campaign, New Chama, Register Org, New Welfare, plus any create button/link), show a friendly prompt telling them to log in, then navigate to `/auth` and return them to the create page after login.
2. If the user is **logged in but KYC is not approved**, always show a clear message stating KYC verification is required for that specific action, with a direct button to `/kyc-upload` (or the right status: pending / rejected / not submitted) — never a silent block or a redirect to a blank screen.

This must be consistent everywhere: FAB menu, Home page CTAs, list pages ("Create Chama", "Create Welfare", "Start Campaign", "Register Organization"), and the create pages themselves.

## Changes

### 1. New shared helper: `src/lib/requireAuthAndKyc.ts`
A single function `guardCreateAction({ user, profile, featureLabel, navigate, intendedPath })` that:
- If no `user`: `toast.info("Please log in to create a <featureLabel>")`, store `intendedPath` in `sessionStorage` as `postLoginRedirect`, navigate to `/auth`. Return `false`.
- If `profile.kyc_status !== 'approved'`: `toast.warning` with the exact reason ("Verify your identity first to create a <featureLabel>" / "Your KYC is under review" / "Your KYC was rejected — please resubmit"), navigate to `/kyc-upload` (or `/profile` when pending). Return `false`.
- Else return `true`.

### 2. `FloatingActionMenu.tsx`
- Remove the current hard hide based on `profile?.kyc_status !== "approved"`. Instead, always show the FAB for logged-in OR logged-out users (still hidden on admin/auth/create paths).
- For logged-out users: tapping any action calls the guard → toast + redirect to `/auth`.
- For logged-in but un-KYC'd users: tapping any action calls the guard → toast naming the specific feature ("You need verified KYC to create a Chama") + redirect to `/kyc-upload`.

### 3. `KycGate.tsx`
- Add a logged-out state branch: if `!user`, render a card "Please log in to create a <featureLabel>" with a "Log in" button that navigates to `/auth` and stores the return path. This way users who deep-link to `/chama/create`, `/welfare/create`, `/mchango/create`, `/organizations/create` while logged out get a clear page instead of a generic redirect.
- Keep all existing KYC states (approved, pending, rejected, not_submitted) untouched — they already say the right things.

### 4. `ProtectedRoute.tsx`
- When redirecting unauthenticated users to `/auth`, store `location.pathname` in `sessionStorage.postLoginRedirect` so post-login can return them to the create page they were trying to reach.

### 5. `Auth` page (`src/pages/Auth.tsx` — read first)
- After successful login, if `sessionStorage.postLoginRedirect` exists, consume it and `navigate(returnTo)` instead of the default landing.

### 6. Audit and wire the guard on every "Create" entry point
Scan and update these surfaces to use `guardCreateAction` (or to be wrapped by `KycGate`) so behavior is uniform:
- `src/pages/Home.tsx` — quick-action create buttons
- `src/pages/ChamaList.tsx` — "Create Chama" button
- `src/pages/WelfareList.tsx` — "Create Welfare" button
- `src/pages/MchangoList.tsx` and `MchangoExplore.tsx` — "Start Campaign" button
- `src/pages/OrganizationList.tsx` — "Register Organization" button
- `FloatingActionMenu.tsx` — as above

On each, the button stays visible; click runs the guard so the user always receives a clear message.

## What stays the same
- KYC rules, who can create, edge functions, DB — unchanged.
- Create-page forms themselves — unchanged; only their gate wrappers improve.
- Admin / auth routes — unaffected.

## UX summary the customer will see
- Not logged in + tap Create → toast "Please log in to create a Chama" → `/auth` → after login, returns to `/chama/create`.
- Logged in, no KYC + tap Create → toast "Verify your identity first to create a Chama" → `/kyc-upload`.
- Logged in, KYC pending + tap Create → toast "Your KYC is under review" → stays/visits profile, no blank page.
- Logged in, KYC approved → create page loads normally.
