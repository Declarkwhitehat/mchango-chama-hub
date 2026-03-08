
Root cause identified:
- The insert path in `DonationForm` uses `.insert(...).select().single()`.
- For guest donors, `mchango_donations` currently has no SELECT policy that allows anon to read inserted rows.
- Result: the INSERT can be valid, but the forced RETURNING/SELECT fails with RLS and surfaces as:
  `new row violates row-level security policy for table mchango_donations`.

Implementation plan:

1) Fix guest insert flow (frontend)
- File: `src/components/DonationForm.tsx`
- Remove dependency on post-insert row selection for guest flow:
  - Generate `donationId` client-side (`crypto.randomUUID()`).
  - Include `id: donationId` in `donationData`.
  - Replace:
    - `.insert(donationData).select().single()`
    with:
    - `.insert(donationData)` (no returning select).
  - Use `donationId` directly in STK callback metadata and later update query.

2) Keep strict data privacy (no broad anon SELECT policy)
- Do not add a permissive anon SELECT policy on `mchango_donations` (contains PII like phone/email).
- Keep existing RLS model focused on:
  - insert allowed for guest/authenticated under `user_id` checks
  - selective read access for owner/admin/creator paths.

3) Optional backend hardening migration (if needed after step 1)
- Add a narrow INSERT policy cleanup migration to avoid overlapping legacy policy behavior:
  - keep one explicit INSERT policy for `anon, authenticated`
  - condition:
    `(user_id IS NULL) OR (auth.uid() IS NOT NULL AND user_id = auth.uid())`
- This is only if policy audit shows ambiguity after frontend fix.

4) End-to-end verification (explicitly requested)
- Test as fully logged-out user on shared campaign URL:
  - submit donation form
  - confirm no RLS toast
  - confirm STK push request is triggered
  - confirm pending donation row exists with generated `id`, `user_id = null`.
- Test as logged-in user:
  - confirm donation insert + STK initiation still works.
- Validate network:
  - no `POST /rest/v1/mchango_donations` RLS error
  - successful flow through `payment-stk-push`.
- Validate database:
  - recent row appears in `mchango_donations` with expected `payment_status` and reference updates.

Technical details:
- Why this works:
  - RLS failure is tied to `RETURNING` visibility, not necessarily raw INSERT permission.
  - Eliminating `.select()` removes the need for anon read permission on PII table.
- Security posture:
  - avoids making `mchango_donations` broadly readable.
  - preserves existing least-privilege access rules.
