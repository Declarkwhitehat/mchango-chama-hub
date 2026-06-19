CREATE TABLE IF NOT EXISTS public.kyc_cleanup_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.kyc_cleanup_runs TO service_role;
GRANT ALL ON public.kyc_cleanup_runs TO service_role;

ALTER TABLE public.kyc_cleanup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.kyc_cleanup_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_kyc_cleanup_runs_created ON public.kyc_cleanup_runs(created_at DESC);