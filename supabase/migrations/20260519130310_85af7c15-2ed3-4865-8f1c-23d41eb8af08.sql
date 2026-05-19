ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_withdrawals_metadata_kind
  ON public.withdrawals ((metadata->>'kind'));