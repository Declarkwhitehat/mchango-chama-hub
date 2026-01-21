-- Create financial ledger table for tracking all platform financial transactions
CREATE TABLE public.financial_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transaction_type TEXT NOT NULL,  -- 'donation', 'withdrawal', 'contribution'
  source_type TEXT NOT NULL,       -- 'mchango', 'organization', 'chama'
  source_id UUID NOT NULL,         -- ID of the mchango/org/chama
  reference_id UUID,               -- ID of the donation/contribution record
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,4) NOT NULL,  -- e.g., 0.05 for 5%
  payer_name TEXT,
  payer_phone TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;

-- Only admins can view the ledger
CREATE POLICY "Admins can view financial ledger" ON public.financial_ledger
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can manage the ledger
CREATE POLICY "Admins can manage financial ledger" ON public.financial_ledger
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_financial_ledger_created_at ON public.financial_ledger(created_at DESC);
CREATE INDEX idx_financial_ledger_source_type ON public.financial_ledger(source_type);
CREATE INDEX idx_financial_ledger_transaction_type ON public.financial_ledger(transaction_type);
CREATE INDEX idx_financial_ledger_source_id ON public.financial_ledger(source_id);

-- Backfill from existing organization donations
INSERT INTO public.financial_ledger (
  transaction_type, source_type, source_id, reference_id,
  gross_amount, commission_amount, net_amount, commission_rate,
  payer_name, payer_phone, description, created_at
)
SELECT 
  'donation', 'organization', organization_id, id,
  COALESCE(gross_amount, amount), 
  COALESCE(commission_amount, 0), 
  COALESCE(net_amount, amount),
  0.05,
  COALESCE(display_name, 'Anonymous'),
  phone,
  'Donation to organization',
  COALESCE(completed_at, created_at)
FROM public.organization_donations
WHERE payment_status = 'completed';

-- Backfill from existing mchango donations
INSERT INTO public.financial_ledger (
  transaction_type, source_type, source_id, reference_id,
  gross_amount, commission_amount, net_amount, commission_rate,
  payer_name, payer_phone, description, created_at
)
SELECT 
  'donation', 'mchango', mchango_id, id,
  COALESCE(gross_amount, amount), 
  COALESCE(commission_amount, 0), 
  COALESCE(net_amount, amount),
  0.15,
  COALESCE(display_name, 'Anonymous'),
  phone,
  'Donation to mchango campaign',
  COALESCE(completed_at, created_at)
FROM public.mchango_donations
WHERE payment_status = 'completed';

-- Fix organization current_amount to match available_balance
UPDATE public.organizations 
SET current_amount = available_balance 
WHERE current_amount != available_balance;