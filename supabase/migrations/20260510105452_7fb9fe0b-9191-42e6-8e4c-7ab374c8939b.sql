ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS transaction_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safaricom_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_revenue numeric NOT NULL DEFAULT 0;