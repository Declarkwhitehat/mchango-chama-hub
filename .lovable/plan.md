## Goal

Let group managers request deletion of any uploaded document. The document remains visible during a 72-hour cooldown, all members get a push notification, and platform admins can either force-delete immediately or cancel the request. After 72h with no admin action, the document is permanently removed.

## 1. Database changes (migration)

Add deletion-state columns to `public.group_documents`:

- `deletion_requested_at timestamptz`
- `deletion_requested_by uuid` (manager who requested)
- `deletion_scheduled_for timestamptz` (requested_at + 72h)
- `deletion_reason text`
- `deletion_status text` — `null` (active) | `'pending'` | `'cancelled'`
- `deleted_at timestamptz` (final tombstone marker, set when actually purged)

Index: `(deletion_status, deletion_scheduled_for)` for the cron scan.

RLS: keep current SELECT policy (members can still see). Add UPDATE policy so:
- group managers/executives (chama manager / welfare exec / mchango manager / org owner) can set `deletion_status='pending'`.
- admins (`has_role(auth.uid(),'admin')`) can update to `cancelled` or hard-delete.

## 2. Edge function: `request-document-deletion`

Input: `{ document_id, reason? }`. Validates JWT, confirms caller is a manager of the parent entity (uses existing helpers `is_chama_manager`, `is_welfare_chairman/secretary`, mchango `managers[]`, org owner). Then:
1. Updates row → `deletion_status='pending'`, sets `deletion_requested_*`, `deletion_scheduled_for = now()+72h`.
2. Resolves all member user_ids for the entity.
3. Bulk-inserts a row per member into `notifications` with category `'document_deletion'`, title "Document scheduled for deletion", message including doc title + 72h notice. The existing `notify_push_on_notification_insert` trigger fans out push notifications automatically.

## 3. Edge function: `process-document-deletions` (cron)

Scheduled hourly via `supabase/config.toml` cron (or `pg_cron`). For every row where `deletion_status='pending'` AND `deletion_scheduled_for <= now()`:
- Remove file from `group-documents` storage bucket.
- Delete the DB row (or set `deleted_at` + remove file — we'll hard-delete to match current admin behavior).
- Insert a final notification per member: "Document deleted".

## 4. Frontend — `src/components/GroupDocuments.tsx`

Replace the current admin-only delete button with a manager Trash button that opens a confirm dialog asking for an optional reason, then calls `request-document-deletion`.

For documents with `deletion_status='pending'`, render an amber banner inside the row:
- "Scheduled for deletion in Xh Ym (by {manager name})"
- Reason if present.
- Download still works.

Props update: pass new `isManager` prop from each detail page (managers can now request; current `isAdmin` retained for direct override path inside the same component is removed — admin override lives on admin dashboard).

Update callers (`ChamaDetail.tsx`, `WelfareDetail.tsx`, `MchangoDetail.tsx`, `OrganizationDetail.tsx`) to pass `isManager` based on already-known role flags.

## 5. Admin dashboard — new page `src/pages/AdminDocumentDeletions.tsx`

Lists all `group_documents` where `deletion_status='pending'`:

```text
[Document title]   entity name/type   requested by   scheduled for   reason
[Cancel] [Delete now] [Download]
```

- **Cancel**: sets `deletion_status='cancelled'`, clears `deletion_scheduled_for`, notifies members ("Deletion cancelled by admin").
- **Delete now**: removes from storage, deletes row, notifies members.
- **Download**: existing storage download.

Wire into `AdminSidebar.tsx` under existing Documents section, route added in `App.tsx` (e.g. `/admin/document-deletions`), guarded by `AdminProtectedRoute`.

## 6. Notifications

Use existing `notifications` table + `notify_push_on_notification_insert` trigger — no extra wiring needed for push delivery. Category strings:
- `document_deletion_scheduled`
- `document_deletion_cancelled`
- `document_deleted`

## Files to add / edit

**New**
- `supabase/migrations/<ts>_group_document_deletion_workflow.sql`
- `supabase/functions/request-document-deletion/index.ts`
- `supabase/functions/process-document-deletions/index.ts`
- `src/pages/AdminDocumentDeletions.tsx`

**Edited**
- `src/components/GroupDocuments.tsx` — request flow, pending banner, countdown
- `src/pages/ChamaDetail.tsx`, `WelfareDetail.tsx`, `MchangoDetail.tsx`, `OrganizationDetail.tsx` — pass `isManager`
- `src/App.tsx` — admin route
- `src/components/admin/AdminSidebar.tsx` — nav entry
- `supabase/config.toml` — cron schedule for `process-document-deletions`

## Out of scope

- Per-document email digests (push + in-app notification only).
- Restoring already hard-deleted files (no soft-delete recovery beyond cooldown).
