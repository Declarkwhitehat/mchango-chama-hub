
CREATE TABLE IF NOT EXISTS public.mpesa_receipt_registry (
  receipt text PRIMARY KEY,
  source_table text NOT NULL,
  source_id uuid,
  amount numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mpesa_receipt_registry TO service_role;

ALTER TABLE public.mpesa_receipt_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_receipt_registry" ON public.mpesa_receipt_registry;
CREATE POLICY "service_role_only_receipt_registry"
  ON public.mpesa_receipt_registry
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.enforce_unique_mpesa_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt text;
  v_existing_table text;
  v_amount numeric;
BEGIN
  v_receipt := NULLIF(TRIM(COALESCE(
    (to_jsonb(NEW) ->> 'mpesa_receipt_number'),
    (to_jsonb(NEW) ->> 'mpesa_receipt')
  )), '');

  IF v_receipt IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT source_table INTO v_existing_table
    FROM public.mpesa_receipt_registry
   WHERE receipt = v_receipt;

  IF v_existing_table IS NOT NULL THEN
    RAISE EXCEPTION
      'Duplicate M-Pesa receipt % already recorded in %',
      v_receipt, v_existing_table
      USING ERRCODE = 'unique_violation';
  END IF;

  v_amount := NULLIF(COALESCE(
    to_jsonb(NEW) ->> 'gross_amount',
    to_jsonb(NEW) ->> 'amount'
  ), '')::numeric;

  INSERT INTO public.mpesa_receipt_registry (receipt, source_table, source_id, amount)
  VALUES (v_receipt, TG_TABLE_NAME, (to_jsonb(NEW) ->> 'id')::uuid, v_amount)
  ON CONFLICT (receipt) DO NOTHING;

  RETURN NEW;
END;
$$;

INSERT INTO public.mpesa_receipt_registry (receipt, source_table, source_id, amount, created_at)
SELECT mpesa_receipt_number, 'welfare_contributions', id, gross_amount, COALESCE(created_at, now())
  FROM public.welfare_contributions
 WHERE mpesa_receipt_number IS NOT NULL AND TRIM(mpesa_receipt_number) <> ''
ON CONFLICT (receipt) DO NOTHING;

INSERT INTO public.mpesa_receipt_registry (receipt, source_table, source_id, amount, created_at)
SELECT mpesa_receipt_number, 'contributions', id, amount, COALESCE(created_at, now())
  FROM public.contributions
 WHERE mpesa_receipt_number IS NOT NULL AND TRIM(mpesa_receipt_number) <> ''
ON CONFLICT (receipt) DO NOTHING;

INSERT INTO public.mpesa_receipt_registry (receipt, source_table, source_id, amount, created_at)
SELECT mpesa_receipt_number, 'mchango_donations', id, COALESCE(gross_amount, amount), COALESCE(created_at, now())
  FROM public.mchango_donations
 WHERE mpesa_receipt_number IS NOT NULL AND TRIM(mpesa_receipt_number) <> ''
ON CONFLICT (receipt) DO NOTHING;

INSERT INTO public.mpesa_receipt_registry (receipt, source_table, source_id, amount, created_at)
SELECT mpesa_receipt_number, 'organization_donations', id, COALESCE(gross_amount, amount), COALESCE(created_at, now())
  FROM public.organization_donations
 WHERE mpesa_receipt_number IS NOT NULL AND TRIM(mpesa_receipt_number) <> ''
ON CONFLICT (receipt) DO NOTHING;

INSERT INTO public.mpesa_receipt_registry (receipt, source_table, source_id, amount, created_at)
SELECT mpesa_receipt_number, 'transactions', id, amount, COALESCE(created_at, now())
  FROM public.transactions
 WHERE mpesa_receipt_number IS NOT NULL AND TRIM(mpesa_receipt_number) <> ''
ON CONFLICT (receipt) DO NOTHING;

INSERT INTO public.mpesa_receipt_registry (receipt, source_table, source_id, amount, created_at)
SELECT mpesa_receipt, 'chama_late_payment_buffer', id, gross_amount, COALESCE(created_at, now())
  FROM public.chama_late_payment_buffer
 WHERE mpesa_receipt IS NOT NULL AND TRIM(mpesa_receipt) <> ''
ON CONFLICT (receipt) DO NOTHING;

DROP TRIGGER IF EXISTS trg_unique_receipt_welfare_contributions ON public.welfare_contributions;
CREATE TRIGGER trg_unique_receipt_welfare_contributions
  BEFORE INSERT ON public.welfare_contributions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_mpesa_receipt();

DROP TRIGGER IF EXISTS trg_unique_receipt_contributions ON public.contributions;
CREATE TRIGGER trg_unique_receipt_contributions
  BEFORE INSERT ON public.contributions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_mpesa_receipt();

DROP TRIGGER IF EXISTS trg_unique_receipt_mchango_donations ON public.mchango_donations;
CREATE TRIGGER trg_unique_receipt_mchango_donations
  BEFORE INSERT ON public.mchango_donations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_mpesa_receipt();

DROP TRIGGER IF EXISTS trg_unique_receipt_organization_donations ON public.organization_donations;
CREATE TRIGGER trg_unique_receipt_organization_donations
  BEFORE INSERT ON public.organization_donations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_mpesa_receipt();

DROP TRIGGER IF EXISTS trg_unique_receipt_transactions ON public.transactions;
CREATE TRIGGER trg_unique_receipt_transactions
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_mpesa_receipt();

DROP TRIGGER IF EXISTS trg_unique_receipt_late_buffer ON public.chama_late_payment_buffer;
CREATE TRIGGER trg_unique_receipt_late_buffer
  BEFORE INSERT ON public.chama_late_payment_buffer
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_mpesa_receipt();

CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_mpesa_receipt
  ON public.transactions (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL AND mpesa_receipt_number <> '';
