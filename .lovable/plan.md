## Goal

1. Remove the `Pamojanova:` prefix from every SMS in `supabase/functions/chama-join/index.ts` (the only remaining offender — `src/utils/smsService.ts` templates are already clean).
2. Add success-rate / trust-score guidance to the manager's join-request SMS so they're reminded to check the member's score before approving.
3. Keep messages short, professional, GSM-7 safe (no emojis), per the existing SMS Sanitization Policy.

## Changes

### `supabase/functions/chama-join/index.ts`

- Line 511 — manager join-request alert. New text:
  `${requesterName} has requested to join your chama "${chamaName}". Only approve members you personally know. Check their success rate, name, ID and phone in the app before approving.`

- Line 670 — approval SMS to requester. New text:
  `Your request to join "${chamaName}" has been approved. Open the app to make your first contribution.`

- Line 671 — rejection SMS to requester. New text:
  `Your request to join "${chamaName}" was not approved by the manager. You may contact them or request a new invite code.`

### `src/utils/smsService.ts`
- Line 119 — update the stale comment `// SMS Templates — Pamojanova branded, professional, concise` to drop the brand-prefix wording (templates themselves are already prefix-free).

## Notes

- No business logic, RLS, or schema changes.
- Sender ID already identifies the platform, so removing the prefix matches the SMS Sanitization Policy memory.
- Other SMS senders across the codebase were checked and do not contain the `Pamojanova:` prefix.
