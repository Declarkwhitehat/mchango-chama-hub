ALTER TABLE public.withdrawals DROP CONSTRAINT withdrawals_status_check;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check 
  CHECK (status = ANY (ARRAY[
    'pending', 'approved', 'rejected', 'completed', 
    'processing', 'failed', 'pending_retry', 'pending_approval'
  ]));