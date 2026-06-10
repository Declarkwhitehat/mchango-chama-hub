---
name: Verified-Creator Approval Flow
description: Entities created by verified users are NOT auto-verified; admin must approve via verification_requests
type: feature
---
When a verified user creates a chama/welfare/organization/mchango, the entity is created **unverified**. The CRUD edge function (or `notify-admin-verified-create` for client-side org create) auto-inserts a `verification_requests` row with `request_reason` starting `[AUTO]` and notifies all admins. Admin approves via the existing Verification Requests page to flip `is_verified=true` and issue the badge.

DB trigger `apply_creator_verification` now only sets `creator_is_verified=true` (no longer flips `is_verified`).

Rejection of `[AUTO]` requests skips the fee refund (no fee was charged). Logic in `VerificationRequestsManagement.handleReject` checks the `[AUTO]` prefix.
