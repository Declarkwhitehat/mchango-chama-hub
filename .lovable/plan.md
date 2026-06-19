## Goal

Automatically delete accounts that haven't completed KYC verification 2 weeks after signup, and send SMS + push reminders every 72 hours during that window.

## Behavior

For each profile where `kyc_status != 'approved'` AND `deleted_at IS NULL` AND no admin/super_admin role:

- **Reminders at 72h, 144h, 216h, 288h after signup (4 reminders)** — SMS + in-app notification telling the user how many days remain until auto-deletion and a link to upload KYC.
- **Auto-delete at 14 days (336h) after signup** — soft-delete the profile (`deleted_at`, `deletion_reason='kyc_not_verified_14d'`), set memberships to `left`, ban the auth user (reusing the same soft-delete pattern as `delete-my-account`).

Safeguards (skip auto-delete, still allowed to remind):
- User has admin/super_admin role
- User has any pending/approved/processing withdrawal
- User manages an active or pending chama
- KYC submitted and pending admin review (`kyc_status = 'pending'`) — pause the clock; only delete if still not approved 14d after submission

## Implementation

### 1. New edge function: `kyc-auto-cleanup`
`supabase/functions/kyc-auto-cleanup/index.ts` — cron-invoked, service-role.

Logic:
```
fetch profiles where kyc_status != 'approved' AND deleted_at IS NULL
  AND created_at <= now() - 72h
for each:
  hoursSinceSignup = (now - created_at) / 3600
  if hoursSinceSignup >= 336 and safe_to_delete(user):
     soft-delete + ban (mirrors delete-my-account flow)
     send final SMS "Account removed"
  else:
     bucket = floor(hoursSinceSignup / 72)  // 1,2,3,4
     if bucket not already sent (tracked in new table):
        send SMS + create notification
        record reminder in kyc_reminders_sent
```

### 2. New tracking table
`kyc_reminders_sent (user_id, bucket smallint, sent_at)` with unique `(user_id, bucket)` so reminders don't double-fire. Grants for `service_role`; RLS enabled, no client policies needed.

### 3. Cron schedule
pg_cron job invoking `kyc-auto-cleanup` every 6 hours (via `supabase--insert`, not migration — contains project URL/anon key).

### 4. SMS templates (GSM-7 safe, no emojis, per project memory)
- 72h: `Hi {name}, verify your KYC within {daysLeft} days or your PAMOJA NOVA account will be removed. Upload: pamojanova.com/kyc`
- Final (delete): `Your PAMOJA NOVA account was removed because KYC was not completed within 14 days. Sign up again anytime.`

### 5. Admin visibility
Add a small "KYC Auto-Cleanup" status card in `src/components/admin/CleanupJobStatus.tsx` showing last run + counts (reuse pattern from `chama-auto-cleanup`).

### 6. Memory
Save `mem://security/kyc-auto-cleanup-policy.md` documenting the 14-day window, 72h reminder cadence, exclusions, and add a Core line to the index.

## Files

**New**
- `supabase/functions/kyc-auto-cleanup/index.ts`
- `mem://security/kyc-auto-cleanup-policy.md`

**Edited**
- `src/components/admin/CleanupJobStatus.tsx` (add status row)
- `mem://index.md` (reference + Core line)

**Migration** — create `kyc_reminders_sent` table + grants + RLS.
**Insert (not migration)** — pg_cron schedule for `kyc-auto-cleanup` every 6 hours.

## Verification

After build: manually invoke `kyc-auto-cleanup` via `supabase--curl_edge_functions`, confirm reminder row appears for a test profile older than 72h, confirm a profile older than 14d gets soft-deleted (on staging only — production safeguarded by the existing exclusions).
