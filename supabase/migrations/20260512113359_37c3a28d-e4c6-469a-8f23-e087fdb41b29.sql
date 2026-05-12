UPDATE withdrawals
SET status = 'pending_retry',
    b2c_error_details = NULL,
    notes = COALESCE(notes,'') || E'\n[SYSTEM] Reset after b2c-payout approval-guard fix'
WHERE id IN (
  '4fa3643d-3ba1-4bba-8fd6-f9f11d0f681a',
  'f9ac326a-d8e7-4b8f-9ae4-abe8511bce17'
);