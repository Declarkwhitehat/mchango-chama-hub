
-- Safety net table for C2B callbacks that fail (unmatched or error) so nothing is ever lost
CREATE TABLE IF NOT EXISTS public.unmatched_c2b_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpesa_receipt_number TEXT NOT NULL UNIQUE,
  amount NUMERIC NOT NULL,
  phone_number TEXT,
  account_number TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  transaction_time TEXT,
  raw_callback JSONB,
  failure_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | allocated | refunded | ignored
  allocated_to_type TEXT, -- chama | welfare | mchango | organization
  allocated_to_id UUID,
  allocated_by UUID REFERENCES auth.users(id),
  allocated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.unmatched_c2b_payments TO authenticated;
GRANT ALL ON public.unmatched_c2b_payments TO service_role;

ALTER TABLE public.unmatched_c2b_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view unmatched" ON public.unmatched_c2b_payments
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update unmatched" ON public.unmatched_c2b_payments
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_unmatched_c2b_status_created ON public.unmatched_c2b_payments(status, created_at DESC);

CREATE TRIGGER trg_unmatched_c2b_updated_at
  BEFORE UPDATE ON public.unmatched_c2b_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
