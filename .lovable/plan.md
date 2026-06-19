## Granular Maintenance Mode + Auto-Reconciliation

Upgrade maintenance mode from a single global on/off into per-module switches, with an automatic sweep that recovers any payments received during the maintenance window when a module is turned back on.

### 1. Data model
Extend `platform_settings` with one new key: `maintenance_modules` storing JSON:
```json
{
  "global": { "enabled": false },
  "chama":       { "enabled": false, "since": null },
  "welfare":     { "enabled": false, "since": null },
  "donations":   { "enabled": false, "since": null },
  "withdrawals": { "enabled": false, "since": null }
}
```
`since` records the timestamp the module was put into maintenance so the reconciliation sweep knows the time window.

Keep the existing `maintenance_mode` / `maintenance_title` / `maintenance_message` keys for the global screen — `global.enabled` mirrors them for backward compatibility.

### 2. Admin UI — `AdminMaintenanceMode.tsx`
Replace the single switch with a list of switches:
- Global maintenance (full-screen block, existing behavior)
- Chama
- Welfare
- Donations (Mchango + Organizations)
- Withdrawals (B2C payouts)

Each row shows: switch, status badge (Live/Off), "since" timestamp, and after turning OFF a previously-on module a "Reconciliation summary" panel appears showing what was swept.

A single Save button writes the JSON. Toggling OFF triggers the reconciliation edge function for that module and shows the result inline.

Audit: every toggle writes to `admin_action_log` via `logAdminAction("maintenance.module.toggle", ...)`.

### 3. New hook — `useMaintenanceModules()`
React-query hook returning `{ global, chama, welfare, donations, withdrawals }` flags. Realtime-subscribed to `platform_settings` (reuse the channel pattern in `MaintenanceGate`). Used by:
- `MaintenanceGate` (only `global.enabled` triggers the full-screen block; admins still bypass).
- Module pages/forms for inline banners.

### 4. Inline banner + disabled actions
A small `<ModuleMaintenanceBanner module="chama" />` component renders an amber alert "Chama payments are paused for maintenance. Any payments you've already sent are safe and will be applied once we're back." Plus the relevant submit buttons get `disabled` when the flag is on:
- Chama: `ChamaPaymentForm`, payout approval actions, `WithdrawalButton` for chama
- Welfare: `WelfareContributionForm`, `WelfareWithdrawalRequest`
- Donations: `DonationForm`, `OrganizationDonationForm`, `MchangoOfflinePayment`
- Withdrawals: all B2C trigger buttons (`WithdrawalButton`, `AdminWithdrawals` retry)

### 5. Server-side enforcement
Edge functions that initiate the relevant flows check the module flag at start and return `503 { error: "module_maintenance" }`:
- chama STK / contribution functions
- welfare contribution + withdrawal functions
- mchango + organization donation functions
- B2C / withdrawal dispatch functions

A tiny shared helper `supabase/functions/_shared/checkMaintenance.ts` reads `platform_settings.maintenance_modules` once per invocation.

Important: callback/webhook functions (M-Pesa C2B, STK callback, B2C result) are NEVER blocked — they keep recording payments to the database so nothing is lost. Only the user-initiated triggers are gated.

### 6. Reconciliation sweep — new edge function `maintenance-reconcile`
Invoked automatically when a module flips from on → off (and exposed as a manual "Re-run reconciliation" button per module). Super-admin only.

Input: `{ module: "chama" | "welfare" | "donations" | "withdrawals", since: ISO }`

For the given module, between `since` and now, the function:
- **chama**: finds C2B/STK transactions with `status='pending'` or unallocated `actual_payment_date` rows for chama accounts → runs the existing settlement engine path, fires the standard payment SMS.
- **welfare**: scans `welfare_contributions` pending rows + raw C2B with welfare account refs → allocates to active cycle, sends SMS.
- **donations**: scans `mchango_donations` + `organization_donations` for pending/unmatched rows → finalizes and sends donor SMS.
- **withdrawals**: scans `withdrawals` stuck in `processing` past their lock → re-checks B2C result, completes or surfaces in the existing reconciliation alerts table.

Returns `{ scanned, recovered, failed, items: [...] }` which the admin UI displays inline.

Also fires a `notifications` row to all super_admins: "Reconciliation complete: N payments recovered for <module>".

### 7. Memory
- New `mem://architecture/granular-maintenance-mode.md` documenting modules, flag shape, reconciliation guarantee, and that webhooks are never gated.
- Update `mem://index.md` Architecture section.

### Technical notes
- The toggle handler on the admin page calls `maintenance-reconcile` only on the off-transition; turning on just records `since=now()`.
- The sweep reuses existing settlement/SMS code paths — no new allocation logic, just a re-trigger over the time window.
- Inline banner copy is shared (single component, module name interpolated) to keep wording consistent.
- No changes to global RLS or roles; this builds on the existing super_admin gate already protecting `AdminMaintenanceMode`.
