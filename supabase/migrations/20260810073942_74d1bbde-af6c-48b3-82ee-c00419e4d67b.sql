ALTER TABLE public.welfare_loan_repayments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS checkout_request_id text;

CREATE INDEX IF NOT EXISTS idx_welfare_loan_repay_checkout
  ON public.welfare_loan_repayments(checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;