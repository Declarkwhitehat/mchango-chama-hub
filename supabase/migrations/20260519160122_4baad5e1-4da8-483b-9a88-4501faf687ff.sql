
ALTER TABLE public.chama_members
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_amount_due numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_unfreeze_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unfrozen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_chama_members_status_frozen
  ON public.chama_members(chama_id, status)
  WHERE status = 'frozen';
