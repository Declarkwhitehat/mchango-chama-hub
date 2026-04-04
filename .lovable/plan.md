
Goal

- Fix the mismatch where a cycle-complete chama shows `Group Members (0)` even though people have already rejoined, and stop stale previous-cycle member/turn data from leaking into the current UI.

What I found

- `Kings self help group🫴` is currently in `cycle_complete`.
- It still has 6 old `chama_members` rows, all `status = inactive`.
- It has 5 approved `chama_rejoin_requests` for the next cycle.
- `src/pages/ChamaDetail.tsx` currently counts members with `approval_status === 'approved' && status === 'active'`, so the Members tab becomes 0 after completion.
- `CycleCompleteManager` uses `chama_rejoin_requests`, so it shows a different count from the Members tab.
- `CycleCompleteBanner.tsx` also reads `chama_rejoin_requests` directly, but regular members are limited by access rules, so its count can be wrong too.
- Turn calculation still uses old approved/inactive members, which can cause stale “it’s his turn” behavior.

Implementation plan

1. Make cycle-complete use a different source of truth
- For `pending` and `active` chamas, keep using approved `chama_members`.
- For `cycle_complete`, use approved `chama_rejoin_requests` as the source of truth for “who is in the next cycle”.

2. Extend the rejoin backend response
- Update `supabase/functions/chama-rejoin/index.ts` to return a safe cycle-complete summary:
  - approved next-cycle participants
  - confirmed count
  - current user’s own rejoin status
  - pending/new-member requests only for managers
- This gives one consistent backend response for both manager and member views.

3. Fix the Chama detail page
- Update `src/pages/ChamaDetail.tsx` to:
  - use approved active members for active/pending groups
  - use approved rejoin participants for cycle-complete groups
- Change the Members section label during `cycle_complete` to something clearer like `Confirmed Next Cycle Members`.
- Make the header/member badge follow the same rule so counts stay consistent on the page.

4. Stop stale turn data after completion
- In `src/pages/ChamaDetail.tsx`, only calculate current turn and next-turn dates when the chama is actually `active`.
- Clear turn-related state for `cycle_complete` so unconfirmed or inactive old members cannot appear in the queue.

5. Fix the cycle-complete banner mismatch
- Update `src/components/chama/CycleCompleteBanner.tsx` to stop counting rejoin rows directly from the client.
- Load the confirmed count and the current user’s request state from the rejoin function instead, so all members see the same number.

6. Keep the manager panel aligned
- Update `src/components/chama/CycleCompleteManager.tsx` only as needed to consume the same response shape and stay aligned with the Members tab and banner.

7. Do a small consistency sweep
- Check other count surfaces that may still mix old members and rejoin requests, especially:
  - `src/pages/ChamaList.tsx`
  - admin chama count views
- If needed, apply the same rule there so cycle-complete counts do not disagree across screens.

Technical details

- Main files likely affected:
  - `supabase/functions/chama-rejoin/index.ts`
  - `src/pages/ChamaDetail.tsx`
  - `src/components/chama/CycleCompleteBanner.tsx`
  - `src/components/chama/CycleCompleteManager.tsx`
  - possibly `src/pages/ChamaList.tsx` and admin chama views
- No database migration should be required.
- Access control should remain strict:
  - regular members can see approved next-cycle participants/counts
  - only managers can see pending/new-member approval details

QA checklist

- Open Kings self help group while it is `cycle_complete`.
- Verify the Members tab no longer shows `0` when approved rejoin requests exist.
- Verify the member count matches the cycle-complete manager panel.
- Verify regular members see the correct confirmed total without seeing manager-only pending data.
- Verify users who have not been confirmed/rejoined do not appear as current turn or confirmed next-cycle members.
- Restart the chama and confirm the display switches back to the new `chama_members` roster correctly.
