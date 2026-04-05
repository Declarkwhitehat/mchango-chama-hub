
-- Fix Cycle 1: mark as complete since payout was already processed
UPDATE contribution_cycles 
SET is_complete = true 
WHERE chama_id = '835f94fd-a521-4e30-a017-8974ec576d5a' 
  AND cycle_number = 1 
  AND payout_processed = true;

-- Fix Cycle 2: start immediately (today) instead of tomorrow
UPDATE contribution_cycles 
SET start_date = (now() AT TIME ZONE 'Africa/Nairobi')::date::timestamptz,
    end_date = ((now() AT TIME ZONE 'Africa/Nairobi')::date + interval '22 hours')
WHERE chama_id = '835f94fd-a521-4e30-a017-8974ec576d5a' 
  AND cycle_number = 2 
  AND payout_processed = false;
