
## What I found (root causes)

### 1. Simon Karanja KYC bypass — privilege escalation via RLS
The `profiles` table has this policy:
```
UPDATE "Users can update own profile" USING (auth.uid() = id)  -- no with_check, no column restriction
```
Combined with `is_verified` default `false` and `kyc_status` default `pending`, **any logged-in user can `UPDATE profiles SET kyc_status='approved', is_verified=true WHERE id = auth.uid()`** from the browser. No selfie, no fee, no admin needed. That is exactly Simon's row: `kyc_status='approved'`, `is_verified=true`, `kyc_submitted_at=NULL`, `kyc_reviewed_at=NULL`, `id_front_url=NULL`. He set it himself.

The welfare RLS check `kyc_status='approved'` then passed, and `welfare-crud` has no server-side KYC gate at all (unlike chama-crud / mchango-crud), so creation went through.

### 2. Maintenance Mode does nothing for normal users
`platform_settings` has only `Admins can view`. Regular users get an empty result, so `MaintenanceGate` always reads `enabled=false`. The gate works for admins (who bypass anyway) and nobody else.

### 3. Chama Set "1 missed payments"
DB shows both members `missed_payments_count=0`, `balance_deficit=0`, no rows in `chama_member_debts` or `chama_cycle_deficits`. The "missed" tag in `MemberDetailPanel` comes from the cross-chama trust score RPC (`total_missed_payments`) which counts historical misses from other chamas and surfaces them on every chama detail. The Chama Set members list itself is clean — the misleading badge needs to be scoped to the current chama.

### 4. Notifications
- Auto-removal currently only writes an in-app notification, no SMS.
- Payout completion sends push to donors (mchango) but the chama/welfare payout recipient gets no SMS confirming "you received KES X from <chama name>".
- Push fan-out is wide: chat messages, every join request, every contribution by every member, daily reminders, cycle-open, KYC pings, verification pings. Need to keep only payment-affecting and money-moving events.

---

## Fixes

### A. Lock down profile self-update (security)
Migration:
1. Drop the unrestricted "Users can update own profile" policy.
2. Recreate it with a `WITH CHECK` that blocks changes to KYC / verification / role columns:
```sql
CREATE POLICY "Users can update own profile (safe cols)"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND kyc_status       = (SELECT kyc_status       FROM profiles WHERE id = auth.uid())
  AND is_verified      = (SELECT is_verified      FROM profiles WHERE id = auth.uid())
  AND kyc_submitted_at IS NOT DISTINCT FROM (SELECT kyc_submitted_at FROM profiles WHERE id = auth.uid())
  AND kyc_reviewed_at  IS NOT DISTINCT FROM (SELECT kyc_reviewed_at  FROM profiles WHERE id = auth.uid())
  AND kyc_reviewed_by  IS NOT DISTINCT FROM (SELECT kyc_reviewed_by  FROM profiles WHERE id = auth.uid())
  AND verified_at      IS NOT DISTINCT FROM (SELECT verified_at      FROM profiles WHERE id = auth.uid())
);
```
3. Belt-and-braces trigger `prevent_kyc_self_escalation` BEFORE UPDATE on `profiles`: if the caller is not service_role and not admin, force the protected columns to their OLD values.
4. Reset Simon back to clean state: `kyc_status='pending'`, `is_verified=false`. Delete the welfare he created (or set it to inactive pending KYC — confirm in plan), and notify him by SMS to re-submit KYC.

### B. Server-side KYC gates on every creation path
Add the same gate that `chama-crud` uses to:
- `welfare-crud` (insert branch, before INSERT)
- Org creation path (currently direct from `src/pages/OrganizationCreate.tsx` — move insert through a new `organizations-crud` edge function OR add a `KYC approved users can create organizations` RLS policy on `organizations` like the welfare one). Plan picks the RLS-policy route since organizations are already a single table — faster and equally safe.
- Mchango: already gated, leave alone.
Also add KYC RLS policies to `welfares` insert (already exists per migrations) and verify they reference `kyc_status='approved' AND is_verified=true` (welfare currently checks only kyc_status — tighten to require both).

### C. Maintenance Mode actually restricts
Migration: add a public-readable policy limited to maintenance keys:
```sql
CREATE POLICY "Anyone can read maintenance flags"
ON public.platform_settings FOR SELECT TO anon, authenticated
USING (setting_key IN ('maintenance_mode','maintenance_title','maintenance_message'));
GRANT SELECT ON public.platform_settings TO anon;
```
Keep admin-only policies for other keys. `MaintenanceGate` will then receive real values for everyone. Add a focus/visibilitychange refetch so toggling it propagates without realtime.

### D. Chama Set "1 missed" false flag
In `MemberDetailPanel.tsx` (and `ChamaDetail.tsx` member rows), stop surfacing cross-chama `total_missed_payments` as a per-chama badge. Show it only inside the Trust Score expanded panel and label it "Lifetime misses across all chamas". The per-member row badges use only `member.missed_payments_count` (current chama).

### E. Auto-removal SMS
In `chama-crud` / wherever `removed_at` is set (the day-1 auto-removal path and the manual removal path), after the removal: call `send-transactional-sms` with a sanitized message: `Hi {first_name}, you have been removed from {chama_name} due to {reason}. You can rejoin if the manager re-opens the chama.` Push stays as in-app only.

### F. Payout receipt SMS to recipient
After successful B2C in `b2c-callback` (chama) and `welfare-cooling-off-payout`, when status flips to completed, send the **recipient** an SMS:
`Hi {first_name}, you have received KES {net_amount} from {group_name} payout. M-Pesa ref: {receipt}. Sisi tuko pamoja.` (no emojis, sanitized).

### G. Push notification diet
Update `_shared/notifications.ts` / call-sites to suppress push (keep in-app only) for these categories — they will no longer be sent via `send-push-notification`:
- `chat_message`
- `chama_contribution` (every member ping when somebody else pays)
- `welfare_contribution_received` (peer pings)
- `cycle_opened` / `cycle_reminder` non-final
- `kyc_submitted` / verification request pings to the user themselves (admin still gets push)
- Join/leave requests to non-managers
Keep push for: payouts, withdrawals, KYC approved/rejected, removal, freeze, manager-approval-required, final-deadline reminder, money received.

---

## Files / surfaces touched

**Migration** (one file, with grants + policies + trigger + Simon reset):
- `supabase/migrations/<new>.sql`

**Edge functions**
- `supabase/functions/welfare-crud/index.ts` — add KYC gate on insert + recipient SMS hook
- `supabase/functions/b2c-callback/index.ts` — recipient SMS after completion
- `supabase/functions/welfare-cooling-off-payout/index.ts` — recipient SMS
- `supabase/functions/chama-crud/index.ts` — SMS on auto-removal / manual removal
- `supabase/functions/_shared/notifications.ts` — push category allowlist
- Removal of push from non-critical call-sites (chat, peer contributions, cycle open)

**Frontend**
- `src/components/MaintenanceGate.tsx` — focus/visibility refetch
- `src/components/chama/MemberDetailPanel.tsx` — relabel lifetime misses, gate badge
- `src/pages/ChamaDetail.tsx` — only show `missed_payments_count` in row badge
- `src/pages/OrganizationCreate.tsx` — guarded by new RLS, surface friendly error if not KYC

## Out of scope (will not change in this pass)
- Reworking trust score schema
- Rewriting org creation to go through an edge function (RLS sufficient)
- Email/business-email setup (separate request)

Reply "go" to implement.
