---
name: SMS Broadcast Privilege Code Gate
description: Admin SMS Broadcast page and edge function both require the ADMIN_PRIVILEGE_CODE (D3E9C0L1A3R9K) in addition to admin role
type: feature
---
`AdminSmsBroadcast` page renders a privilege-code unlock screen (matches `AdminPaybillBalance` / `AdminCommissionAnalytics` pattern, 5-attempt lockout) before any broadcast UI is shown. Every call to the `admin-sms-broadcast` edge function (preview AND send) must include `privilege_code: "D3E9C0L1A3R9K"` in the body; the function rejects with 403 "Invalid privilege code" otherwise. JWT auth + admin role check still apply on top of this.
