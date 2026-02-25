

## Plan: Fix Withdrawal Balance Not Updating After Successful B2C Payout

### Root Cause

The B2C callback logs confirm the issue:

```
Finding withdrawal: { conversationId: "AG_20250225_...", originatorConversationId: "0464-44ca-...", occasion: "" }
Could not find withdrawal with any method
Withdrawal not found for callback
```

The payout of KES 30 was **successfully sent** (TransactionID: UBPF97PELP), but the callback could not match it back to the withdrawal record. Since the balance deduction code only runs after finding the withdrawal, **the mchango balance was never reduced**.

### Why All 5 Lookup Methods Failed

There is a **race condition** between `b2c-payout` and `b2c-callback`:

1. `b2c-payout` sets `payment_reference = 'WD-<uuid>'` and `status = 'processing'`
2. Makes the B2C API call with `Occasion = 'WD-<uuid>'`
3. Safaricom processes instantly and sends the callback
4. **Callback arrives BEFORE `b2c-payout` updates `payment_reference` to the ConversationID** (line 254)

So at callback time:
- **Method 1** (ConversationID in payment_reference): Fails because payment_reference is still `WD-<uuid>`, not yet updated to ConversationID
- **Method 2** (OriginatorConversationID in payment_reference): Same reason
- **Method 3** (Occasion = `WD-<uuid>`): Fails because Safaricom does NOT echo the Occasion field back in the callback (it's empty/undefined)
- **Method 4** (Search notes for ConversationID): Fails because notes haven't been updated yet either (same race condition)
- **Method 5** (Phone number match): This SHOULD work but appears to have failed, likely due to the `payment_methods` join returning null

### Fix

Add a new **primary lookup method** to `b2c-callback/findWithdrawal` that searches for the `WD-<uuid>` format directly in `payment_reference`. Since `b2c-payout` sets `payment_reference = 'WD-<uuid>'` BEFORE the API call, this value is guaranteed to be present when the callback arrives.

#### Changes to `supabase/functions/b2c-callback/index.ts`

1. **Add Method 0** (before all others): Look for any `processing` withdrawal where `payment_reference` starts with `WD-` and matches by ConversationID or OriginatorConversationID stored in the notes. But more reliably:
   - Look for `processing` withdrawals with `payment_reference LIKE 'WD-%'` and match by phone number (this is the most reliable pre-overwrite method)

2. **Better approach**: Since `b2c-payout` sets `Occasion = payoutReference` in the B2C payload but Safaricom doesn't echo it back, we should **stop overwriting `payment_reference`** with the ConversationID. Instead, store the ConversationID in a separate approach:
   - Before the B2C call, `payment_reference = 'WD-<uuid>'` 
   - After B2C success, store ConversationID in notes only (don't overwrite payment_reference)
   - In callback, Method 3 already extracts the UUID from `WD-<uuid>` format and looks up by `id` — but it needs the Occasion field which Safaricom doesn't provide

3. **Simplest reliable fix**: In `b2c-payout`, do NOT overwrite `payment_reference` with ConversationID after B2C success. Keep it as `WD-<uuid>`. Then add a new lookup method in the callback that searches for `payment_reference = 'WD-<withdrawal_id>'` by trying all `processing` status withdrawals and matching via ConversationID in notes. 

   **Actually, the simplest fix**: Add a lookup that finds any `processing` withdrawal matching the phone number from the callback. Method 5 already does this but may have a bug. Let me propose:

#### Final Approach (Two Changes)

**Change 1: `b2c-payout/index.ts`** — Stop overwriting `payment_reference` after B2C success. Instead, store both the WD reference AND ConversationID:
- Line 254: Change from `payment_reference: b2cResult.ConversationID` to storing ConversationID only in notes (keep `payment_reference` as `WD-<uuid>`)

**Change 2: `b2c-callback/index.ts`** — Add a new Method 0 before all others:
- Look up by extracting withdrawal ID from `payment_reference` pattern. Since we can't get the Occasion, instead: look for any `processing` withdrawal and match by the ConversationID or OriginatorConversationID stored in notes. 
- BUT notes haven't been updated yet due to the race condition.

**Actually the cleanest fix**: Store ConversationID in a **separate column** or just don't overwrite payment_reference. Then the callback can find the withdrawal by phone + status = processing (fixing Method 5).

Let me look at why Method 5 failed specifically — the phone `254707874790` should match. The issue might be that `payment_methods` join syntax is wrong or the data is missing.

**Root fix — two changes:**

1. **`b2c-payout/index.ts` (line 253-254)**: Do NOT overwrite `payment_reference`. Store ConversationID in notes only. This ensures `payment_reference` remains `WD-<uuid>` when the callback arrives.

2. **`b2c-callback/index.ts`**: Add a new Method 1.5 that directly searches for `processing` status withdrawals with `payment_reference` matching `WD-%` pattern and checks if the notes contain the ConversationID or OriginatorConversationID. But since notes may not be updated yet either...

**The truly bulletproof fix**: 
- In `b2c-payout`, keep `payment_reference = 'WD-<uuid>'` (don't overwrite)
- In `b2c-callback`, add a new method that finds the withdrawal by `id` extracted from the `payment_reference` pattern on any `processing` withdrawal, matching by phone number

**Simplest approach that works:**

1. **`b2c-payout/index.ts`**: Stop overwriting `payment_reference` with ConversationID. Keep it as `WD-<uuid>`. Store ConversationID in a notes append only.

2. **`b2c-callback/index.ts`**: Add new lookup after Method 2 — search for `processing` withdrawals where `payment_reference` starts with `WD-` matching the recipient phone number. This is similar to Method 5 but simpler and doesn't rely on the `payment_methods` join.

3. **Data fix**: Update the existing completed withdrawal to deduct the KES 30 from the mchango balance.

### Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/b2c-payout/index.ts` | Stop overwriting `payment_reference` with ConversationID after B2C success — keep it as `WD-<uuid>` so callback can always find it |
| `supabase/functions/b2c-callback/index.ts` | Add robust phone-based lookup for `processing` withdrawals; fix Method 5 join; add direct `WD-<uuid>` to ID extraction without relying on Occasion |
| Database (data fix) | Deduct KES 30 from mchango `current_amount` and `available_balance` for the completed withdrawal that was missed |

