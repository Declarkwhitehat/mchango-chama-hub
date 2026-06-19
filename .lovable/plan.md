## Add "Send SMS" to Admin → User Management

### What to build
On `AdminUsers.tsx`, add a "Send SMS" action button on each user row that opens a dialog with:
- Recipient phone (prefilled, read-only, normalized to `254…`)
- Message textarea (with character counter, sanitized per existing SMS sanitization policy)
- Send button

On send, invoke a new edge function `admin-send-user-sms` which:
1. Verifies caller is admin (`has_role`)
2. Loads target user's phone from `profiles`
3. Normalizes to `254XXXXXXXXX` (Onfon requirement, comma-separated for multiple — single recipient here)
4. Sends via Onfon using the same credentials/pattern as `admin-sms-broadcast`
5. Logs to `admin_sms_broadcasts` (single-recipient entry) for audit
6. Returns clear JSON errors (surfaced via existing `edgeFunctionErrors` helper, not "non-2xx")

### Verification
After deploy, call the function targeting phone `0707874790` (normalized to `254707874790`) with a short test message and confirm:
- Function returns 200 with Onfon `responseCode: "200"`
- Row appears in `admin_sms_broadcasts`
- Onfon logs show delivery

### Technical notes
- Reuse Onfon client code from `supabase/functions/admin-sms-broadcast/index.ts` (extract minimal send helper inline — no shared module needed).
- Phone normalization: strip non-digits; `07…`/`7…` → `2547…`; `01…`/`1…` → `2541…`; reject otherwise.
- Sanitize message: strip emojis/non-GSM-7 chars (per existing policy).
- No schema changes required.

### Files
- `supabase/functions/admin-send-user-sms/index.ts` (new)
- `src/pages/AdminUsers.tsx` (add button + dialog + invoke)
