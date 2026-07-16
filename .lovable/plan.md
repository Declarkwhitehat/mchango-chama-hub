# Hide Phone Numbers in Welfare Views & Statements

Show phone numbers as `070******0` (first 3 + masked middle + last 1 digit) to regular members. Only admins/super_admins see the full number. Include Member ID (member_code) alongside so members can still be uniquely identified.

## Scope

Applies to any welfare-context surface where a member's phone appears today:

1. **`src/components/welfare/WelfareTransactionLog.tsx`**
   - On-screen table (Contributions + Withdrawals tabs): mask phone column; add a **Member ID** column that uses `welfare_members.member_code` for contributions and (best-effort) the payer's welfare member code for withdrawals.
   - Members summary cards: mask phone.
   - Detail dialog: mask phone.
   - PDF export (both contributions and withdrawals sections + detail PDF): mask phone; add Member ID column.
   - Phone search input: keep working — match against the unmasked value in-memory so admins and non-admins both get results, but never render the raw number for non-admins.

2. **`src/components/welfare/WelfarePaymentLookup.tsx`**
   - Already shows `member_code` (good). Currently does not display phone — leave as-is, but if we later add contact info, apply the same masking rule.

3. **`src/components/welfare/WelfareContributionReport.tsx` (PDF statement)**
   - Already omits phone and already includes `member_code`. No change needed unless we want to explicitly add "Phone" — we won't.

Out of scope: chama, mchango, organizations, admin-only pages (`AdminWelfares*`, `AdminWelfareDetail`, etc.) — admins already have full visibility there.

## Admin detection

Add a small hook `useIsAdmin()` mirroring `useIsSuperAdmin` but checking `role IN ('admin','super_admin')` via two `user_roles` lookups (or a single `.in('role', [...])`). Reuse it in the two welfare components above.

## Masking helper

New util `src/utils/maskPhone.ts`:

```ts
export function maskPhone(phone?: string | null): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 5) return "***";
  const last = digits.slice(-1);
  // Normalize leading country code 254 -> 0 for display
  const local = digits.startsWith("254") ? "0" + digits.slice(3) : digits;
  const prefix = local.slice(0, 3);
  const middleLen = Math.max(0, local.length - 4);
  return `${prefix}${"*".repeat(middleLen)}${last}`;
}
```

Example: `0707874790` → `070******0`, `+254707874790` → `070******0`.

## Rendering rule

In each spot that renders a phone:

```tsx
{isAdmin ? phone : maskPhone(phone)}
```

Apply the same conditional inside the jsPDF `doc.text(...)` calls for the PDF exports so downloaded statements are also masked for non-admins.

## Technical details

- No DB or edge function changes — masking is presentation-only. The `welfare_members`/`profiles` join still returns the raw phone (needed so admins see it and so search still works), we just don't render it for non-admins.
- Member ID column pulls from `welfare_members.member_code`, which is already joined into `contributions` and available via a lookup for `withdrawals` (fall back to `-` when unknown).
- Search-by-phone continues to filter on the raw digits so results stay consistent between admin and non-admin views.

## Files to change

- add: `src/utils/maskPhone.ts`
- add: `src/hooks/useIsAdmin.ts`
- edit: `src/components/welfare/WelfareTransactionLog.tsx` (table, summary, dialog, PDF; add Member ID column)

## Verification

- As a regular welfare member: table, summary, dialog, and downloaded PDF show `070******0` and a visible Member ID column/field.
- As an admin/super_admin: full phone number remains visible everywhere.
- Phone search still returns the correct rows for both roles.
