
CREATE TABLE public.payout_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  scheduled_beneficiary_id UUID NOT NULL REFERENCES public.chama_members(id),
  recommended_member_id UUID REFERENCES public.chama_members(id),
  chosen_member_id UUID REFERENCES public.chama_members(id),
  payout_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  ineligible_members JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  withdrawal_id UUID REFERENCES public.withdrawals(id),
  b2c_triggered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id)
);

ALTER TABLE public.payout_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payout approvals"
ON public.payout_approval_requests
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Chama managers can view their approval requests"
ON public.payout_approval_requests
FOR SELECT
TO authenticated
USING (public.is_chama_manager(auth.uid(), chama_id));
