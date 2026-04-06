

## Plan: Update ONFON_SENDER_ID to "OnfonInfo"

### What needs to happen
The `ONFON_SENDER_ID` secret currently holds an incorrect value. It needs to be updated to **OnfonInfo**, which is the Sender ID you want displayed on SMS messages.

### Steps
1. **Update the `ONFON_SENDER_ID` secret** to the value `OnfonInfo` using the secrets management tool.
2. **Redeploy the `send-transactional-sms` edge function** so it picks up the updated secret value.

No code changes are needed — the edge function already reads `ONFON_SENDER_ID` from the environment and passes it as the `SenderId` field in the API request.

