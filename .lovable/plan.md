## Problem

When a user without `kyc_status = 'approved'` opens any create page (`/welfare/create`, `/chama/create`, `/mchango/create`, `/organizations/create`):

- `ProtectedRoute requireKYC` fires `toast.error(...)` and `navigate(...)`, while `return null` flashes a **blank screen** before the redirect lands.
- The toast message is generic (`"Your KYC status is: pending..."`) and doesn't tell the user whether to **upload KYC** or just **wait for review**.
- `WelfareCreate.tsx` has no inline KYC gate at all (the other three create pages do, but inconsistently styled and with the same blank-flash issue from the route guard).

## Goal

Show a clear, friendly status card on the create page itself based on the user's KYC state. No blank screens, no surprise redirects.

## Approach

### 1. Stop ProtectedRoute from redirecting on non-approved KYC

In `src/components/ProtectedRoute.tsx`:

- Keep the **auth** check (redirect to `/auth` if not logged in) and the **PIN** check.
- **Remove** the KYC redirect block (the `if (requireKYC && profile)` branch in the effect, plus the `if (requireKYC && profile && profile.kyc_status !== 'approved') return null;` line).
- Instead, pass `requireKYC` through and let the page render. The page itself owns the KYC UX.

This eliminates the blank flash and the noisy toast.

### 2. Create a shared `KycGate` component

New file: `src/components/KycGate.tsx`

Props: `{ children: React.ReactNode; featureLabel: string }` (e.g. `"welfare group"`, `"chama"`, `"campaign"`, `"organization"`).

Behavior:

- Reads `profile` from `useAuth()` (already loaded — no extra fetch needed).
- While `profile` is `null` and `loading`, show a small skeleton/spinner inside `Layout`-friendly markup (no full-page blank).
- Branches on state:

  | State | UI |
  |---|---|
  | `kyc_status === 'approved'` | Render `children` (with optional small green confirmation alert) |
  | `!kyc_submitted_at` (never uploaded) | Amber card: "Verify your identity to create a {featureLabel}." Primary button → `/kyc-upload`. |
  | `kyc_submitted_at` && `kyc_status === 'pending'` | Blue/info card: "Your KYC documents are under review. You'll be able to create a {featureLabel} once an admin approves them — usually within 24 hours." No action button (or a secondary "Back to Home"). |
  | `kyc_status === 'rejected'` | Red card: show rejection reason if available, button → `/kyc-upload` to resubmit. |

- Does NOT render the create form's children unless approved, so all existing form logic stays untouched.

### 3. Wrap each create page with `KycGate`

Edit:

- `src/pages/WelfareCreate.tsx` — wrap the inner `<div className="container ...">` content with `<KycGate featureLabel="welfare group">…</KycGate>` (inside `<Layout>`). Remove no existing logic; the form simply won't render until approved.
- `src/pages/ChamaCreate.tsx` — replace the existing inline `kycStatus` fetch + alert blocks with `<KycGate featureLabel="chama">`. Remove the now-redundant `useEffect` + `kycStatus` state.
- `src/pages/MchangoCreate.tsx` — same treatment, `featureLabel="campaign"`.
- `src/pages/OrganizationCreate.tsx` — same treatment, `featureLabel="organization"`.

This consolidates four divergent implementations into one consistent, clearer UX.

### 4. Keep the route prop for future-proofing

Leave `requireKYC` accepted by `ProtectedRoute` (no-op for now) so `App.tsx` doesn't need changes. This avoids a sweeping refactor and lets us re-enable a route-level guard later if desired.

## Files Changed

- `src/components/ProtectedRoute.tsx` — remove KYC redirect branch and the `null` short-circuit for unapproved KYC.
- `src/components/KycGate.tsx` — **new**, shared gating component with three friendly states.
- `src/pages/WelfareCreate.tsx` — wrap form with `KycGate`.
- `src/pages/ChamaCreate.tsx` — wrap form with `KycGate`, remove duplicate KYC state/effect/alerts.
- `src/pages/MchangoCreate.tsx` — same.
- `src/pages/OrganizationCreate.tsx` — same.

## Out of Scope

- No backend / RLS changes (server-side KYC enforcement on insert remains in place).
- No changes to KYC upload page itself.
- No changes to non-create pages.

## User-Visible Result

- Non-KYC user clicking "Create Welfare" (or any other create option): sees a clear amber card asking them to verify identity, with a button to KYC upload — never a blank screen.
- User who already submitted KYC and is awaiting review: sees a calm info card saying "We're reviewing your documents — please wait." No misleading "upload KYC" prompt.
- Rejected user: sees the reason and a button to resubmit.
- Approved user: sees the create form exactly as today.
