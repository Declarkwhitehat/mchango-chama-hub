
-- Unique constraint on contributions.payment_reference (prevent duplicate inserts)
CREATE UNIQUE INDEX IF NOT EXISTS unique_contributions_payment_ref 
  ON public.contributions(payment_reference) WHERE payment_reference IS NOT NULL;

-- Unique constraint on contributions.mpesa_receipt_number
CREATE UNIQUE INDEX IF NOT EXISTS unique_contributions_mpesa_receipt 
  ON public.contributions(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;

-- Settlement lock table for atomic idempotency
CREATE TABLE IF NOT EXISTS public.settlement_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid UNIQUE NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  settlement_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settlement_locks ENABLE ROW LEVEL SECURITY;

-- Reconciliation anomalies log table
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  expected_value numeric,
  actual_value numeric,
  difference numeric,
  details jsonb,
  auto_corrected boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reconciliation logs" ON public.reconciliation_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view settlement locks" ON public.settlement_locks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
