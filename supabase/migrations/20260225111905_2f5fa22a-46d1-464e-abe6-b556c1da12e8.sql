
-- Fix the stuck withdrawal that was successfully paid but callback couldn't find it
UPDATE withdrawals 
SET status = 'completed', 
    completed_at = '2026-02-25T11:11:20+00:00',
    payment_reference = 'UBPF97PELP',
    notes = COALESCE(notes, '') || E'\n[SYSTEM] Manually completed - B2C was successful (TxID: UBPF97PELP) but callback failed to match withdrawal due to race condition.'
WHERE id = 'dd2b4851-3b22-4930-977f-a970699b790f' AND status = 'processing';

-- Deduct the 30 KES from mchango balance
UPDATE mchango 
SET current_amount = GREATEST(0, current_amount - 30),
    available_balance = GREATEST(0, available_balance - 30)
WHERE id = 'a8723f41-5a12-468b-a87f-53d46cc81f82';
