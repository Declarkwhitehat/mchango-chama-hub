

## End-to-End Test Review: Chama System Upgrade

I cannot perform interactive browser testing in this mode, but I've reviewed all the implemented code for correctness. Here are my findings:

---

### Code Review Results

**1. Randomized Payout Order (chama-start) — Correct**
Fisher-Yates shuffle using `crypto.getRandomValues()` is properly implemented at lines 154-161. Order is assigned once and remains fixed. No issues found.

**2. Batch Invite Generation (chama-invite) — Correct**
`batch_generate` action is handled in the edge function. Frontend `ChamaInviteManager.tsx` has batch UI with count selector (1-30). Codes are generated in a loop and bulk-inserted. No issues found.

**3. Group Chat (ChamaChatPanel) — Correct**
Realtime subscription, message loading, send functionality, and announcement toggle all look correct. Uses `as any` casts since `chama_messages` is a new table not yet in the generated types — this is expected and functional.

**4. Trust Scores (compute-trust-scores) — Minor Issue Found**
The function queries `chama_cycle_history` for completed chamas — this table exists. However, there's a **logic bug on line 76-80**: when `totalPayments > 0`, it sets `score = Math.round(onTimeRatio * 70)`, which **replaces** the base score of 50. But when `totalPayments === 0`, it keeps `score = 50`. This means a brand new member with zero history gets a **higher score (50 + 10 clean bonus = 60)** than a member with 50% on-time rate (35 + 0 + 0 = 35). The base score should not be overwritten — it should be additive or the base 50 should be removed.

**5. Trust Score Display (ChamaPendingRequests) — Correct**
Queries `member_trust_scores` table and displays `TrustScoreBadge` next to each pending member. Manager-only visibility.

---

### Recommended Fix

Fix the trust score calculation in `compute-trust-scores/index.ts` to remove the base score of 50 (since it's overwritten anyway when payments exist):

```typescript
// Line 75: Change from
let score = 50; // base score
// To
let score = 0;

// And for users with no payments, give them a neutral starting score
if (totalPayments === 0) {
  score = 50; // neutral for new members
} else {
  score = Math.round((onTimePayments / totalPayments) * 70);
}
```

### To Test Manually

Since interactive testing requires you to be logged in, here's the test checklist to verify in the preview:

1. **Create a Chama** at `/chama/create` — set min_members to 2
2. **Generate batch codes** — click "Generate Batch" with count 5-10 on the Invites tab
3. **Have a second user join** via invite code, then approve their request
4. **Start the Chama** — verify the payout order is randomized (check member positions)
5. **Open the Chat tab** — send a message and verify it appears in real-time
6. **Call compute-trust-scores** edge function — then check if trust scores appear on pending join requests

