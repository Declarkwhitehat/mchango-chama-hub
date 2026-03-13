

## Plan: Welfare Sequential Member IDs, Payment Lookup, and Document Uploads

### Overview

Three features to add to the welfare system:

1. **Sequential unique member IDs** (e.g., `WF4KM0001`) that persist when a member leaves and rejoins
2. **Check Payment lookup** — search by name or member ID to view a member's transaction history
3. **Constitution/Rules document upload** — executives can upload one document (max 3MB), members can view it

---

### 1. Sequential Member IDs with Rejoin Persistence

**Problem**: The current `generate_welfare_member_code()` function creates random 4-char suffixes (e.g., `WF4KHJ7N`). Need sequential IDs like `WF4KM0001`.

**Database Migration**:
- Replace the `generate_welfare_member_code` function with a sequential version: `[group_code]M[zero-padded number]` (same pattern as chama)
- The `assign_welfare_member_code` trigger already calls this function on INSERT

**Edge Function (`welfare-members/index.ts`) — Rejoin Logic** (line 162-180):
- Currently when a user has an existing record with `status = 'left'` or `'removed'`, the code falls through to INSERT (which would create a duplicate or fail). Fix:
  - If `existing` is found with status `left` or `removed`, UPDATE their status back to `active` and keep the same `member_code`
  - This ensures the original sequential ID is preserved on rejoin

### 2. Check Payment Feature

**New component**: `src/components/welfare/WelfarePaymentLookup.tsx`
- Two search inputs: Name and Member ID
- Queries `welfare_contributions` joined with `welfare_members` filtered by the welfare ID
- Displays matching member's contribution history in a table: date, amount, status, receipt
- Shows total contributed and number of payments
- Add as a new tab "Check Payment" in `WelfareDetail.tsx` (visible to all members)

### 3. Constitution/Rules Document Upload

**Database Migration**:
- Add columns to `welfares` table:
  - `constitution_file_path TEXT` — storage path
  - `constitution_file_name TEXT` — original filename
  - `constitution_uploaded_by UUID`
  - `constitution_uploaded_at TIMESTAMPTZ`

**Storage**:
- Create a `welfare-documents` storage bucket (public: false)
- RLS: authenticated users can read files for welfares they're members of; executives can upload

**New component**: `src/components/welfare/WelfareConstitution.tsx`
- If no document uploaded: executives see upload button, members see "No document uploaded"
- Upload validates: file ≤ 3MB, only PDF/DOC/DOCX allowed, only one document per welfare
- If document exists: all members see download button with file name and upload date
- Executives see the document but cannot replace it (must ask admin to delete first)
- Admin can delete the document via the admin welfare detail page

**Add to `WelfareDetail.tsx`**: New tab "Documents" visible to all members

### Files Changed

| File | Change |
|------|--------|
| **Migration** | Replace `generate_welfare_member_code` function with sequential version; add constitution columns to `welfares`; create `welfare-documents` bucket + RLS |
| `supabase/functions/welfare-members/index.ts` | Add rejoin logic: if existing member with `left`/`removed` status, reactivate with same member_code |
| **New** `src/components/welfare/WelfarePaymentLookup.tsx` | Check payment search by name/member ID |
| **New** `src/components/welfare/WelfareConstitution.tsx` | Document upload/view/download for constitution |
| `src/pages/WelfareDetail.tsx` | Add "Check Payment" and "Documents" tabs |

