1. Add two new admin tools under System/Settings
- Create an admin page for SMS provider status showing remaining message balance, last checked time, refresh action, and auto-refresh.
- Create an admin page for Maintenance Mode with a simple on/off switch, maintenance message, optional title, and updated timestamp.
- Add both routes to the admin router and links in the admin sidebar.

2. Reuse the existing platform settings storage
- Store maintenance mode in `platform_settings` instead of creating a new table, since that settings table already exists and is admin-protected.
- Add new setting keys for:
  - `maintenance_mode`
  - `maintenance_message`
  - `maintenance_title`
  - `maintenance_updated_at` / updater metadata if needed
- Keep the data shape JSON-based to match the current settings pattern already used by commission and verification fees.

3. Add a secure backend function for SMS balance
- Create a backend function that queries the SMS provider balance endpoint using the existing provider secrets already used for sending SMS.
- Return only safe fields to the frontend, such as remaining balance/messages, provider status, and checked time.
- Restrict access so only authenticated admins can read it.
- Use this function from the new admin page because provider secrets must stay on the backend.

4. Keep the SMS balance always updated in admin
- Auto-refresh the SMS balance view on an interval while the page is open.
- Add manual refresh for instant re-check.
- Show loading, success, stale, and error states clearly so admins know whether the displayed balance is current.
- Optionally surface the balance summary on the admin dashboard later, but first implement the dedicated page cleanly.

5. Enforce maintenance mode across the app
- Add a global maintenance check near the app routing/auth shell so it runs before normal user navigation.
- When maintenance mode is ON:
  - non-admin users see a branded maintenance screen
  - public pages and member pages are blocked
  - admins can still access admin pages to manage the system
  - auth access can remain available or be blocked depending on current route handling, but admin access must not be locked out
- Show the admin-configured maintenance title/message on the screen.

6. Preserve security and existing behavior
- Do not expose provider API keys in the client.
- Use existing admin role checks (`user_roles` / `has_role`) for settings updates and balance access.
- Keep maintenance mode read-only from the client except through the admin UI.
- Avoid breaking current admin routes, auth flow, and native app behavior.

Technical details
- Files likely to change:
  - `src/App.tsx`
  - `src/components/admin/AdminSidebar.tsx`
  - `src/components/AdminProtectedRoute.tsx` or a new global maintenance guard component
  - new admin pages for SMS balance and maintenance settings
  - new migration for additional `platform_settings` seed rows if missing
  - new backend function for provider balance lookup
- Backend approach for SMS balance:
  - call the provider balance endpoint from a backend function using existing runtime secrets
  - normalize the provider response into a stable frontend shape
- Frontend approach for maintenance:
  - fetch `platform_settings` once at app bootstrap / route guard level
  - bypass the block for admins and `/admin` routes
  - render a dedicated maintenance screen for everyone else

Expected result
- In Admin, you will have one place to monitor remaining SMS/messages from your provider and see it refresh regularly.
- In Admin, you will have one place to turn Maintenance Mode on/off and set the message shown during upgrades or system maintenance.
- When maintenance mode is active, normal users are prevented from using the app while admins retain access.