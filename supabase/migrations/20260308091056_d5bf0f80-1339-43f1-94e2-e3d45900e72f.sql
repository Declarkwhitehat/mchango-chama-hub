
-- Delete member_cycle_payments for duplicate cycles 3 and 4
DELETE FROM member_cycle_payments 
WHERE cycle_id IN (
  'e6ad5c1b-9de9-4a90-bb0d-9429d4f5612b',
  '8c0f7f47-b600-42de-9e5f-4ae426457174'
);

-- Delete the duplicate contribution_cycles
DELETE FROM contribution_cycles 
WHERE id IN (
  'e6ad5c1b-9de9-4a90-bb0d-9429d4f5612b',
  '8c0f7f47-b600-42de-9e5f-4ae426457174'
);
