
-- Drop the old status check constraint
ALTER TABLE public.withdrawals DROP CONSTRAINT withdrawals_status_check;

-- Add new status check constraint with additional statuses for B2C workflow
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'processing'::text, 'failed'::text, 'pending_retry'::text]));
