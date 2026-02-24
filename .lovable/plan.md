

## Plan: Professional Offline Payment Section with Paybill Number

### What Changes

1. **Upgrade `CopyableUniqueId` component** — Add paybill number display (4015351), show only the full composite ID (e.g., `ORGN36K57`, `MC...`, `ACT5MOO1`), and make it a professional, self-contained offline payment instruction card.

2. **Update usage in all 3 detail pages** — Replace the current minimal `CopyableUniqueId` with the enhanced version that includes the paybill number and clear payment steps.

3. **Remove `group_code` display from ChamaDetail** — Currently shows both `group_code` (short code) and `member_code` (full ID). Will only show the full `member_code` in the MemberDashboard.

### Specific Changes

**`src/components/CopyableUniqueId.tsx`** — Complete redesign:
- Add paybill number `4015351` prominently with copy button
- Show the unique account ID (passed as prop) prominently with copy button
- Add numbered M-Pesa payment steps (Lipa na M-Pesa → Paybill → Business No → Account No → Amount → PIN)
- Professional card-style layout with clear visual hierarchy
- Auto-credit confirmation note

**`src/pages/ChamaDetail.tsx`** (line 448-451):
- Remove the `CopyableUniqueId` that shows `group_code` — this is the short group-only code, not useful for payments

**`src/pages/MchangoDetail.tsx`** (line 267-269):
- Keep `CopyableUniqueId` with `paybill_account_id` — this is already the full ID

**`src/pages/OrganizationDetail.tsx`** (line 218-221):
- Keep `CopyableUniqueId` with `paybill_account_id` — this is already the full ID

**`src/components/MemberDashboard.tsx`** (line 353-373):
- Update the Member ID Badge section to use the enhanced `CopyableUniqueId` component with paybill number included, replacing the custom card

### Technical Details

- Paybill number `4015351` is hardcoded since it's the single business shortcode for the platform
- The `CopyableUniqueId` component will accept an optional `label` prop to customize whether it says "Account Number", "Member ID", etc.
- No database changes needed
- No edge function changes needed

