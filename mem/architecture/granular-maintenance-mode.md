---
name: Granular Maintenance Mode
description: Per-module maintenance toggles (chama/welfare/donations/withdrawals) with post-window auto-reconciliation; webhooks never gated
type: feature
---
Maintenance state is stored in `platform_settings.maintenance_modules` as JSON:
`{ global, chama, welfare, donations, withdrawals }` each `{ enabled, since }`.

- `global.enabled` triggers the full-screen `MaintenanceGate` (admins bypass).
- Module flags only show an inline `ModuleMaintenanceBanner` and disable initiating buttons; the rest of the app keeps working.
- Edge functions that INITIATE flows call `_shared/checkMaintenance.ts` and return 503 `module_maintenance` if the relevant module is on.
- Webhooks/callbacks (M-Pesa C2B, STK callback, B2C result) are NEVER gated — they always record payments so nothing is lost.
- On off-transition the admin UI calls the `maintenance-reconcile` edge function with `{ module, since }` which re-runs the existing allocation/status-query paths over the window and notifies all super_admins.
- Reconciliation is super_admin-only and logged to `admin_action_log` with key `maintenance.reconcile`.
