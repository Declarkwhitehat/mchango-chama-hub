-- Add commission breakdown columns to mchango_donations
ALTER TABLE public.mchango_donations 
ADD COLUMN IF NOT EXISTS gross_amount numeric,
ADD COLUMN IF NOT EXISTS commission_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount numeric;

-- Migrate existing data: set gross_amount = amount, calculate commission/net
UPDATE public.mchango_donations 
SET gross_amount = amount,
    commission_amount = amount * 0.15,
    net_amount = amount * 0.85
WHERE gross_amount IS NULL;

-- Add commission breakdown columns to organization_donations
ALTER TABLE public.organization_donations 
ADD COLUMN IF NOT EXISTS gross_amount numeric,
ADD COLUMN IF NOT EXISTS commission_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount numeric;

-- Migrate existing data for organizations (5% commission)
UPDATE public.organization_donations 
SET gross_amount = amount,
    commission_amount = amount * 0.05,
    net_amount = amount * 0.95
WHERE gross_amount IS NULL;

-- Add financial tracking columns to mchango
ALTER TABLE public.mchango 
ADD COLUMN IF NOT EXISTS total_gross_collected numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_commission_paid numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS available_balance numeric DEFAULT 0;

-- Populate mchango financial totals from existing completed donations
UPDATE public.mchango m
SET total_gross_collected = COALESCE(sub.total_gross, 0),
    total_commission_paid = COALESCE(sub.total_commission, 0),
    available_balance = COALESCE(sub.total_net, 0) - COALESCE(w.withdrawn, 0)
FROM (
  SELECT mchango_id, 
         SUM(COALESCE(gross_amount, amount)) as total_gross,
         SUM(COALESCE(commission_amount, amount * 0.15)) as total_commission,
         SUM(COALESCE(net_amount, amount * 0.85)) as total_net
  FROM public.mchango_donations 
  WHERE payment_status = 'completed'
  GROUP BY mchango_id
) sub
LEFT JOIN (
  SELECT mchango_id, SUM(net_amount) as withdrawn
  FROM public.withdrawals
  WHERE status = 'completed' AND mchango_id IS NOT NULL
  GROUP BY mchango_id
) w ON w.mchango_id = sub.mchango_id
WHERE m.id = sub.mchango_id;

-- Add financial tracking columns to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS total_gross_collected numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_commission_paid numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS available_balance numeric DEFAULT 0;

-- Populate organizations financial totals
UPDATE public.organizations o
SET total_gross_collected = COALESCE(sub.total_gross, 0),
    total_commission_paid = COALESCE(sub.total_commission, 0),
    available_balance = COALESCE(sub.total_net, 0) - COALESCE(w.withdrawn, 0)
FROM (
  SELECT organization_id, 
         SUM(COALESCE(gross_amount, amount)) as total_gross,
         SUM(COALESCE(commission_amount, amount * 0.05)) as total_commission,
         SUM(COALESCE(net_amount, amount * 0.95)) as total_net
  FROM public.organization_donations 
  WHERE payment_status = 'completed'
  GROUP BY organization_id
) sub
LEFT JOIN (
  SELECT mchango_id as org_id, SUM(net_amount) as withdrawn
  FROM public.withdrawals
  WHERE status = 'completed'
  GROUP BY mchango_id
) w ON w.org_id = sub.organization_id
WHERE o.id = sub.organization_id;

-- Create platform financial summary table for daily aggregates
CREATE TABLE IF NOT EXISTS public.platform_financial_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date date UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  mchango_gross numeric DEFAULT 0,
  mchango_commission numeric DEFAULT 0,
  mchango_client_funds numeric DEFAULT 0,
  chama_gross numeric DEFAULT 0,
  chama_commission numeric DEFAULT 0,
  chama_client_funds numeric DEFAULT 0,
  savings_gross numeric DEFAULT 0,
  savings_commission numeric DEFAULT 0,
  savings_client_funds numeric DEFAULT 0,
  org_gross numeric DEFAULT 0,
  org_commission numeric DEFAULT 0,
  org_client_funds numeric DEFAULT 0,
  total_gross numeric DEFAULT 0,
  total_commission numeric DEFAULT 0,
  total_client_funds numeric DEFAULT 0,
  pending_withdrawals numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_financial_summary ENABLE ROW LEVEL SECURITY;

-- Only admins can view financial summary
CREATE POLICY "Admins can view financial summary"
ON public.platform_financial_summary
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can manage financial summary
CREATE POLICY "Admins can manage financial summary"
ON public.platform_financial_summary
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);