## Goal

Every welfare member records a next of kin for their group. The details are private to platform admins, can be filled once and then locked for 3 months, and the member can download a professional PDF copy of what they submitted.

## What members see

- **Reminder banner** at the top of the welfare page for anyone who hasn't filled it: a compact amber card, "Add your next of kin — the person who receives your dividends and benefits if anything happens to you", with a "Fill Details" button. Disappears once submitted.
- **Next of Kin section** inside the welfare page (a card under the Overview tab plus the banner shortcut) with the form:
  - Full legal name
  - Phone number (auto-formatted to +254, same rules as signup)
  - Date of birth (date picker)
  - Relationship to you (dropdown: spouse, parent, child, sibling, other + free text for "other")
  - Gender (Male / Female)
  - Notice block, acknowledged with a required checkbox: *"I understand that this person is my nominated next of kin. In the event of my death or incapacity, they are authorised to receive my dividends, contributions and any other benefits from this welfare."*
- **Confirmation dialog before saving** warning the record locks for 3 months.
- **After saving**: read-only summary showing all fields, the date submitted, and "You can update these details on <date>" (submitted date + 90 days). Form fields disabled until then, no exceptions.
- **Download button** producing a branded PDF (same PAMOJA NOVA header/footer styling used by existing welfare statements): welfare name, member name + member ID, all next-of-kin fields, the authorisation statement, submission date and a document serial.

## Privacy

- Next of kin is per welfare group (a member in two welfares fills it twice).
- Only platform admins/super admins can read other members' records; executives (chairman/secretary/treasurer) cannot.
- Members can read and download only their own.
- Admins get a "Next of Kin" section on the admin welfare detail page: a table of members with the details, plus a "Not submitted" marker for gaps.

## Technical details

**Database** — new `public.welfare_next_of_kin` table: `id`, `welfare_id`, `member_id`, `user_id`, `full_name`, `phone`, `date_of_birth`, `relationship`, `relationship_other`, `gender`, `acknowledged_at`, `locked_until` (submitted + 90 days), `created_at`, `updated_at` + updated-at trigger. Unique on `(welfare_id, user_id)`.

Access rules:
- Grants to `authenticated` and `service_role`; no `anon`.
- Members may insert and read only their own row, and may update only when `locked_until <= now()`; a BEFORE UPDATE trigger re-stamps `locked_until` and rejects early edits server-side so the lock can't be bypassed from the client.
- Admins (`has_role(auth.uid(),'admin')` or `'super_admin'`) may read all rows. No delete policy for members.

**Frontend**
- `src/components/welfare/NextOfKinForm.tsx` — form, lock state, confirmation dialog, read-only view.
- `src/components/welfare/NextOfKinBanner.tsx` — dismissible-per-session reminder banner.
- `src/components/welfare/NextOfKinPDFDownload.tsx` — uses the existing `pdfBranding` helper.
- Wire banner + card into `src/pages/WelfareDetail.tsx` (active members only), and an admin table into `src/pages/AdminWelfareDetail.tsx` gated by `useIsAdmin`.
- Validation with zod: name 2–100 chars, valid Kenyan phone via `phoneUtils`, DOB in the past and age ≥ 18, relationship required, gender required, acknowledgement required.
