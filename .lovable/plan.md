## Goal

Make the three admin lookup surfaces — Member Search, Users Management, KYC Management — behave predictably: search only when submitted, match phone numbers in any format, and stop failing when opening a member's details.

## What I verified

- **Search fires per keystroke**: `UsersManagement.tsx` and `AdminKYC.tsx` both run a debounced `fetch...(searchTerm)` inside a `useEffect` on every character typed. Member Search (`AdminSearch.tsx` + `SearchBar.tsx`) is already submit-based.
- **Phone search cannot match**: all 284 profiles store phones as `+254…`. The `admin_search` database function matches `phone ILIKE '%query%'` with no normalisation, so `0711424126` returns 0 rows (confirmed by query); only the raw `+254…` string works. Users Management / KYC do normalise digits client-side, so their phone search works — the failure the user sees on Member Search comes from this function.
- **Error messages are masked**: `AdminSearch.loadActivity`, `AdminUserDetail.loadUserDetails` and `UsersManagement.fetchUsers` all discard the real error and show a fixed string ("Failed to load member activity" / "Failed to load user details"), so the true cause is invisible.
- **`AdminUserDetail` uses `.single()`** on the profile fetch, which throws whenever the row is missing or blocked, producing "Failed to load user details" instead of a clear "user not found".
- The `admin_search` and `get_admin_member_activity` functions are executable by `authenticated` and their bodies run cleanly against real data, so the remaining failures are in the client layer and the phone matching.

## Plan

**1. Submit-only search on all three surfaces**
- Users Management: wrap the input in a form with a Search button; run the query on submit or Enter only. Keep a Clear button that resets to the default recent-users list. Remove the keystroke effect.
- KYC Management: same treatment for its search input.
- Member Search: already submit-based; leave the interaction as is.

**2. Phone-number matching everywhere**
- Update the `admin_search` database function to normalise the query when it looks like a phone number: strip non-digits and match against all equivalent forms (`0…`, `254…`, `+254…`, last 9 digits) for both the `all` and `phone` search types. Also let `member_code` and name searches keep working unchanged.
- Keep the existing client-side normalisation in Users Management / KYC and extend it with the `+254…` variant so all three agree.

**3. Fix and surface member/user detail loading**
- `AdminUserDetail`: switch the profile fetch to `maybeSingle()` and render a clear "User not found" state instead of a toast error; show the actual error text when a query genuinely fails.
- `AdminSearch.loadActivity`: show the real error returned by the function (including "Forbidden") rather than the generic string, and handle the case where the function returns no `data`.
- `UsersManagement.fetchUsers`: surface the real error text too.
- Review the User Detail page's contributions query, which filters `contributions.paid_by_member_id` by a user id; correct it to resolve the user's `chama_members` ids first so the payments tab is accurate.

**4. Test each surface**
- Drive the three pages in the browser as an admin and confirm: typing does not trigger requests, submitting by name / email / phone (`0…`, `+254…`, `254…`) / ID number / member code returns the right rows, clicking a result opens the detail view with profile, groups, payments and withdrawals populated, and no generic error toasts appear.
- Report any surface that still misbehaves with the exact underlying error.

## Technical notes

- The database change is one migration replacing `admin_search` (function body only, no schema or policy change).
- Frontend files touched: `src/components/admin/UsersManagement.tsx`, `src/pages/AdminKYC.tsx`, `src/pages/AdminSearch.tsx`, `src/pages/AdminUserDetail.tsx`.
- The signed-in preview session belongs to a non-admin account, so browser verification of admin routes needs the admin account signed into the preview; otherwise verification will be limited to the query and code level.
