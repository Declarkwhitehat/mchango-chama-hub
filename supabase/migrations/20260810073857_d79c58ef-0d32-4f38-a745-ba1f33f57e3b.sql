ALTER TABLE public.welfares
  ADD COLUMN IF NOT EXISTS loans_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS loan_min_membership_months integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS loan_min_payment_rate numeric NOT NULL DEFAULT 0.95;

CREATE TABLE IF NOT EXISTS public.welfare_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_id uuid NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.welfare_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  loan_type text NOT NULL CHECK (loan_type IN ('multiplier','shares')),
  principal numeric NOT NULL CHECK (principal > 0),
  charge_rate numeric NOT NULL DEFAULT 0,
  charge_amount numeric NOT NULL DEFAULT 0,
  welfare_share numeric NOT NULL DEFAULT 0,
  company_share numeric NOT NULL DEFAULT 0,
  amount_disbursed numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  shares_at_request numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  approvals_count integer NOT NULL DEFAULT 0,
  due_date timestamptz,
  last_interest_at timestamptz,
  disbursed_at timestamptz,
  closed_at timestamptz,
  rejection_reason text,
  mpesa_receipt text,
  withdrawal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.welfare_loans TO authenticated;
GRANT ALL ON public.welfare_loans TO service_role;
ALTER TABLE public.welfare_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own loans" ON public.welfare_loans
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Executives view welfare loans" ON public.welfare_loans
  FOR SELECT TO authenticated USING (public.get_welfare_role(auth.uid(), welfare_id) IN ('chairman','secretary','treasurer'));
CREATE POLICY "Admins manage loans" ON public.welfare_loans
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_welfare_loans_welfare_status ON public.welfare_loans(welfare_id, status);
CREATE INDEX IF NOT EXISTS idx_welfare_loans_member ON public.welfare_loans(member_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_welfare_loans_receipt ON public.welfare_loans(mpesa_receipt) WHERE mpesa_receipt IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.welfare_loan_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.welfare_loans(id) ON DELETE CASCADE,
  approver_user_id uuid NOT NULL,
  approver_role text NOT NULL,
  decision text NOT NULL DEFAULT 'approved' CHECK (decision IN ('approved','rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, approver_user_id)
);

GRANT SELECT ON public.welfare_loan_approvals TO authenticated;
GRANT ALL ON public.welfare_loan_approvals TO service_role;
ALTER TABLE public.welfare_loan_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View loan approvals" ON public.welfare_loan_approvals
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.welfare_loans l WHERE l.id = loan_id AND (l.user_id = auth.uid() OR public.get_welfare_role(auth.uid(), l.welfare_id) IN ('chairman','secretary','treasurer')))
  );
CREATE POLICY "Admins manage loan approvals" ON public.welfare_loan_approvals
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.welfare_loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.welfare_loans(id) ON DELETE CASCADE,
  welfare_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  mpesa_receipt text,
  source text NOT NULL DEFAULT 'offline',
  balance_after numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.welfare_loan_repayments TO authenticated;
GRANT ALL ON public.welfare_loan_repayments TO service_role;
ALTER TABLE public.welfare_loan_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View loan repayments" ON public.welfare_loan_repayments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.welfare_loans l WHERE l.id = loan_id AND (l.user_id = auth.uid() OR public.get_welfare_role(auth.uid(), l.welfare_id) IN ('chairman','secretary','treasurer')))
  );
CREATE POLICY "Admins manage loan repayments" ON public.welfare_loan_repayments
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_welfare_loan_repay_receipt ON public.welfare_loan_repayments(mpesa_receipt) WHERE mpesa_receipt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_welfare_loan_repay_loan ON public.welfare_loan_repayments(loan_id);

CREATE TRIGGER update_welfare_loans_updated_at
  BEFORE UPDATE ON public.welfare_loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();