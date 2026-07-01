
-- Abandoned funds ledger: tracks funds forfeited to company revenue when creators
-- delete expired campaigns (or accounts are deleted with balances).

CREATE TABLE IF NOT EXISTS public.abandoned_funds_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('mchango','welfare','chama','organization','user_account')),
  source_id UUID,
  source_name TEXT,
  owner_user_id UUID,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  commission_taken NUMERIC NOT NULL DEFAULT 0,
  net_swept_to_revenue NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  swept_by UUID,
  swept_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS abandoned_funds_unique_source
  ON public.abandoned_funds_ledger (source_type, source_id, reason)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS abandoned_funds_swept_at_idx
  ON public.abandoned_funds_ledger (swept_at DESC);

GRANT SELECT ON public.abandoned_funds_ledger TO authenticated;
GRANT ALL    ON public.abandoned_funds_ledger TO service_role;

ALTER TABLE public.abandoned_funds_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view abandoned funds"
  ON public.abandoned_funds_ledger
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- RPC: atomic sweep of a mchango's remaining balance to company revenue,
-- with a snapshot row in abandoned_funds_ledger. Called by the
-- mchango-creator-delete edge function using the service role.
CREATE OR REPLACE FUNCTION public.sweep_mchango_to_revenue(
  p_mchango_id UUID,
  p_reason TEXT,
  p_actor UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mch RECORD;
  v_owner RECORD;
  v_available NUMERIC := 0;
  v_ledger_id UUID;
BEGIN
  SELECT id, title, target_amount, current_amount, available_balance,
         end_date, created_by, paybill_account_id
    INTO v_mch
    FROM public.mchango
   WHERE id = p_mchango_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  SELECT full_name, phone, email
    INTO v_owner
    FROM public.profiles
   WHERE id = v_mch.created_by;

  v_available := GREATEST(COALESCE(v_mch.available_balance, v_mch.current_amount, 0), 0);

  INSERT INTO public.abandoned_funds_ledger (
    source_type, source_id, source_name,
    owner_user_id, owner_name, owner_phone, owner_email,
    gross_amount, commission_taken, net_swept_to_revenue,
    reason, metadata, swept_by
  ) VALUES (
    'mchango', v_mch.id, v_mch.title,
    v_mch.created_by, v_owner.full_name, v_owner.phone, v_owner.email,
    v_available, 0, v_available,
    p_reason,
    jsonb_build_object(
      'target_amount', v_mch.target_amount,
      'current_amount', v_mch.current_amount,
      'available_balance', v_mch.available_balance,
      'end_date', v_mch.end_date,
      'paybill_account_id', v_mch.paybill_account_id
    ),
    p_actor
  )
  RETURNING id INTO v_ledger_id;

  IF v_available > 0 THEN
    INSERT INTO public.company_earnings (source, amount, reference_id, description)
    VALUES (
      'abandoned_funds',
      v_available,
      v_mch.id,
      'Forfeited balance from deleted expired campaign: ' || COALESCE(v_mch.title,'(untitled)')
    );

    -- Zero the campaign so no downstream job re-uses the funds.
    UPDATE public.mchango
       SET current_amount = 0,
           available_balance = 0
     WHERE id = p_mchango_id;
  END IF;

  RETURN jsonb_build_object(
    'ledger_id', v_ledger_id,
    'swept_amount', v_available,
    'title', v_mch.title
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_mchango_to_revenue(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_mchango_to_revenue(UUID, TEXT, UUID) TO service_role;
