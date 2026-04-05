
-- Create overpayment wallet table
CREATE TABLE public.chama_overpayment_wallet (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.chama_members(id) ON DELETE CASCADE,
  chama_id UUID NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  source_contribution_id UUID REFERENCES public.contributions(id),
  cycle_id UUID REFERENCES public.contribution_cycles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  applied_to_cycle_id UUID REFERENCES public.contribution_cycles(id),
  applied_at TIMESTAMP WITH TIME ZONE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_overpayment_wallet_member ON public.chama_overpayment_wallet(member_id);
CREATE INDEX idx_overpayment_wallet_chama ON public.chama_overpayment_wallet(chama_id);
CREATE INDEX idx_overpayment_wallet_status ON public.chama_overpayment_wallet(status);

-- Enable RLS
ALTER TABLE public.chama_overpayment_wallet ENABLE ROW LEVEL SECURITY;

-- Members can view their own wallet entries
CREATE POLICY "Members can view their own wallet entries"
ON public.chama_overpayment_wallet
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM chama_members cm
    WHERE cm.id = chama_overpayment_wallet.member_id
      AND cm.user_id = auth.uid()
  )
);

-- Managers can view all wallet entries in their chamas
CREATE POLICY "Managers can view wallet entries in their chamas"
ON public.chama_overpayment_wallet
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM chama_members cm
    WHERE cm.chama_id = chama_overpayment_wallet.chama_id
      AND cm.user_id = auth.uid()
      AND cm.is_manager = true
      AND cm.status = 'active'
  )
);

-- Admins have full access
CREATE POLICY "Admins have full access to overpayment wallet"
ON public.chama_overpayment_wallet
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (for settlement engine)
CREATE POLICY "Service can insert wallet entries"
ON public.chama_overpayment_wallet
FOR INSERT
WITH CHECK (true);

-- Service role can update wallet entries
CREATE POLICY "Service can update wallet entries"
ON public.chama_overpayment_wallet
FOR UPDATE
USING (true);
