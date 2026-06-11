---
name: Welfare Executive Change PIN Gate
description: Assigning/replacing chairman/secretary/treasurer, removing members, and requesting/approving registration-fee changes all require 5-digit PIN re-entry before the action fires
type: feature
---
`WelfareExecutivePanel` wraps `assignRole`, `removeMember`, `requestFeeChange`, `approveFeeChange` in `usePinVerification().requirePin(...)` and mounts `<PinEntryDialog />`. The existing 72/96h withdrawal cooldown (see `welfare/executive-change-security-protocol`) still triggers server-side after the change is committed.
