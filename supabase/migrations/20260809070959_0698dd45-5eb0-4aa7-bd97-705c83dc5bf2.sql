CREATE TABLE IF NOT EXISTS public.c2b_callback_claims (
  receipt text PRIMARY KEY,
  status text NOT NULL DEFAULT 'processing',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT ALL ON public.c2b_callback_claims TO service_role;

ALTER TABLE public.c2b_callback_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_c2b_claims" ON public.c2b_callback_claims;
CREATE POLICY "service_role_only_c2b_claims"
  ON public.c2b_callback_claims
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Atomically claim a receipt for processing.
-- Returns 'claimed' when the caller owns processing rights,
-- 'duplicate' when it was already processed (or is being processed right now).
CREATE OR REPLACE FUNCTION public.claim_c2b_callback(p_receipt text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_created timestamptz;
BEGIN
  INSERT INTO public.c2b_callback_claims (receipt, status)
  VALUES (p_receipt, 'processing')
  ON CONFLICT (receipt) DO NOTHING;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT status, created_at INTO v_status, v_created
    FROM public.c2b_callback_claims
   WHERE receipt = p_receipt
   FOR UPDATE;

  -- Stale processing claim (crashed run) can be retried after 10 minutes
  IF v_status = 'processing' AND v_created < now() - interval '10 minutes' THEN
    UPDATE public.c2b_callback_claims
       SET created_at = now()
     WHERE receipt = p_receipt;
    RETURN 'claimed';
  END IF;

  RETURN 'duplicate';
END;
$$;
