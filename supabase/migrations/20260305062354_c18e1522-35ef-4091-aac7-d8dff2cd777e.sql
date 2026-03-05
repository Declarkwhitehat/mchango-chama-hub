-- Complete withdrawal 0c616645 (KES 15, mchango a8723f41)
UPDATE withdrawals SET status = 'completed', completed_at = now(), b2c_error_details = NULL,
  notes = COALESCE(notes, '') || E'\n[SYSTEM] Manually completed: B2C was successful (ConvID=AG_20260302_010015490foxbxdva8mf) but callback never arrived'
WHERE id = '0c616645-a984-4c14-9373-0dbd6a6fbcd5' AND status = 'pending_retry';

UPDATE mchango SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - 15),
  current_amount = GREATEST(0, COALESCE(current_amount, 0) - 15)
WHERE id = 'a8723f41-5a12-468b-a87f-53d46cc81f82';

-- Complete withdrawal e2ea0312 (KES 10, mchango 84c650ae)
UPDATE withdrawals SET status = 'completed', completed_at = now(), b2c_error_details = NULL,
  notes = COALESCE(notes, '') || E'\n[SYSTEM] Manually completed: B2C was successful (ConvID=AG_20260303_010011550voygkvtyy7j) but callback never arrived'
WHERE id = 'e2ea0312-d66d-489d-a0a4-f0fb6d6c5770' AND status = 'pending_retry';

UPDATE mchango SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - 10),
  current_amount = GREATEST(0, COALESCE(current_amount, 0) - 10)
WHERE id = '84c650ae-6854-47bf-83b7-2e5c1fa780fe';

-- Complete withdrawal bee96b33 (KES 277.5, mchango b33bbd48)
UPDATE withdrawals SET status = 'completed', completed_at = now(), b2c_error_details = NULL,
  notes = COALESCE(notes, '') || E'\n[SYSTEM] Manually completed: B2C was successful (ConvID=AG_20260224_010018551da21r3f7gn9) but callback never arrived'
WHERE id = 'bee96b33-1200-4b89-ab93-c8f962b82bab' AND status = 'pending_retry';

UPDATE mchango SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - 277.5),
  current_amount = GREATEST(0, COALESCE(current_amount, 0) - 277.5)
WHERE id = 'b33bbd48-9a9a-4349-9440-5cde9123b91c';