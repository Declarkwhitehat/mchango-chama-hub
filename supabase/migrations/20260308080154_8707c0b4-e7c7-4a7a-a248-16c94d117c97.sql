
-- 1. Add cycle_id to withdrawals for duplicate payout prevention
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.contribution_cycles(id);

-- 2. Create partial unique index: only one non-rejected withdrawal per chama+cycle
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_cycle_unique 
  ON public.withdrawals(chama_id, cycle_id) 
  WHERE status NOT IN ('rejected', 'failed');

-- 3. Create claim_cycle_for_processing RPC for row-level locking
CREATE OR REPLACE FUNCTION public.claim_cycle_for_processing(p_cycle_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE contribution_cycles 
  SET payout_processed = true, payout_processed_at = now()
  WHERE id = p_cycle_id AND payout_processed = false
  RETURNING true;
$$;
