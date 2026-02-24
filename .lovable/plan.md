

## Root Cause Analysis

The balance never updates because **the M-Pesa B2C callback cannot find the withdrawal record**. Here's why:

1. **Payout function** sends `Occasion: "WD-{withdrawal_id}"` to Safaricom
2. **Safaricom returns the callback with `Occasion: ""`** (empty string) — Safaricom does not reliably echo back the Occasion field
3. The callback's `findWithdrawal` function tries 4 methods, all fail:
   - **Method 1 & 2** (Occasion-based): Skip because Occasion is empty
   - **Method 3** (ConversationID in payment_reference): Fails because `payment_reference` still contains `"WD-{id}"`, NOT the ConversationID
   - **Method 4** (Phone match): Should work but appears to fail for edge cases

**The critical bug**: After a successful B2C initiation (line 251-256 of payout), the code only updates `notes` — it does **NOT** save the `ConversationID` to `payment_reference`. So when the callback arrives and tries Method 3 (`payment_reference = conversationId`), it finds nothing.

## Fix Plan

### 1. Store ConversationID in `payment_reference` after B2C initiation (mpesa-b2c-payout)

At line 251-256, change the update to also set `payment_reference` to the ConversationID returned by Safaricom. This way, when the callback arrives and uses Method 3, it will find the withdrawal.

```typescript
await supabaseAdmin
  .from('withdrawals')
  .update({
    payment_reference: b2cResult.ConversationID,  // <-- ADD THIS
    notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C initiated: ${b2cResult.ConversationID} (ref: ${payoutReference}, attempt ${attemptCount})`
  })
  .eq('id', withdrawal_id);
```

### 2. Add OriginatorConversationID as fallback lookup (mpesa-b2c-callback)

In `findWithdrawal`, add a lookup by `OriginatorConversationID` as an additional fallback since Safaricom always returns this in callbacks.

### 3. Improve Method 4 (phone match) reliability

The phone match currently uses `ReceiverPartyPublicName` which contains format like `"254707874790 - DECLARK OKEMWA CHACHA"`. Ensure the parsing handles this correctly by also checking the profile phone field.

### 4. Deploy both updated functions

Both `mpesa-b2c-payout` and `mpesa-b2c-callback` need redeployment.

### 5. Fix currently stuck withdrawals

Query all withdrawals in `processing` status and manually reconcile them against the callback logs.

## Technical Summary

The fix is small but critical: **save the ConversationID to `payment_reference`** after Safaricom accepts the B2C request, so the callback can find and complete the withdrawal, triggering the balance deduction logic.

