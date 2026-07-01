## Diagnosis

Your request is safely in the database as `pending` — I confirmed one row exists for your user. RLS policies allow every admin/super_admin to read it, and the review page at `/admin/daily-limit-requests` (already wired to `AdminProtectedRoute`) queries this table correctly. So nothing is broken on the backend or in the page itself.

The real problem is discoverability: the admin has to know to click **"Daily Limit Requests"** buried in the sidebar. There is no dashboard tile, no badge count, and no push toward it when a new request comes in — so it feels like nothing happened.

## Plan

1. **Admin sidebar badge** — In `src/components/admin/AdminSidebar.tsx`, fetch `count` of `daily_limit_increase_requests` where `status = 'pending'` on mount + every 30s, and render a small red pill next to the "Daily Limit Requests" item when count > 0.

2. **Admin dashboard tile** — In `src/pages/AdminDashboard.tsx`, add a "Pending Daily-Limit Requests" quick-stat card (same style as the other pending-action cards) linking to `/admin/daily-limit-requests`. Uses the same count query.

3. **Notification bell deep-link** — Ensure the in-app notification inserted by `request-daily-limit-increase` (title "Daily Limit Increase Request") routes admins to `/admin/daily-limit-requests` when clicked. Update `NotificationBell.tsx` routing map if the title/type isn't already handled.

4. **Verify end-to-end** — After the changes, log in as admin, confirm:
   - Sidebar shows badge "1"
   - Dashboard tile shows "1 pending"
   - Clicking either lands on the page and the existing request is visible in the Pending tab.

No schema changes, no edge-function changes — this is purely UI plumbing so admins can't miss a request again.
