

## Plan: Fix Admin Analytics Password Field — Add Visibility Toggle & Fix Blank Screen

### Issues Found

1. **No password visibility toggle** — The privilege code input on `AdminCommissionAnalytics` (line 46) uses `type="password"` with no eye icon to show/hide what you're typing
2. **Potential blank screen** — The `CommissionAnalyticsDashboard` component may fail to render after unlock, causing a white screen

### Changes

**`src/pages/AdminCommissionAnalytics.tsx`**:

- Add a `showCode` boolean state to toggle password visibility
- Change the input `type` from hardcoded `"password"` to `showCode ? "text" : "password"`
- Add an eye/eye-off icon button inside the input field (like the auth page already has) so the admin can see what they're typing
- Import `Eye` and `EyeOff` from lucide-react
- Wrap the `CommissionAnalyticsDashboard` render in error boundary logic (try/catch with a fallback UI) to prevent blank screens if the dashboard component throws

### No other files changed

The fix is entirely within `AdminCommissionAnalytics.tsx`.

