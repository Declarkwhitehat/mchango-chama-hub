DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name FROM pg_constraint
  WHERE conrelid = 'public.company_earnings'::regclass AND conname = 'company_earnings_source_check';
  IF FOUND THEN
    EXECUTE 'ALTER TABLE public.company_earnings DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE public.company_earnings
  ADD CONSTRAINT company_earnings_source_check
  CHECK (source IN (
    'COMMISSION',
    'commission',
    'verificationFee',
    'verification_fee',
    'accountVerificationFee',
    'account_verification_fee',
    'mpesa_b2c_revenue',
    'loan_fees',
    'withdrawal_fees',
    'chama_withdrawal',
    'mchango_withdrawal',
    'organization_withdrawal',
    'welfare_withdrawal',
    'other'
  ));

INSERT INTO public.company_earnings (amount, source, description, group_id, reference_id, created_at)
SELECT
  w.company_revenue,
  'mpesa_b2c_revenue',
  'B2C transaction-fee markup — withdrawal ' || w.id::text,
  COALESCE(w.chama_id, w.organization_id, w.mchango_id, w.welfare_id),
  w.id,
  COALESCE(w.completed_at, w.updated_at, w.created_at, now())
FROM public.withdrawals w
WHERE w.status = 'completed'
  AND COALESCE(w.company_revenue, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.company_earnings ce
    WHERE ce.reference_id = w.id AND ce.source = 'mpesa_b2c_revenue'
  );