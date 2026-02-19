
-- Migration: Chama Engine - Debt/Deficit Tables + Idempotency

-- Table 1: Formal debt records created at cycle end for each non-payer
CREATE TABLE public.chama_member_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.chama_members(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  principal_debt NUMERIC(15,2) NOT NULL,
  penalty_debt NUMERIC(15,2) NOT NULL,
  principal_remaining NUMERIC(15,2) NOT NULL,
  penalty_remaining NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'outstanding',
  created_at TIMESTAMPTZ DEFAULT now(),
  cleared_at TIMESTAMPTZ,
  payment_allocations JSONB DEFAULT '[]'::jsonb,
  CONSTRAINT chama_member_debts_status_check CHECK (status IN ('outstanding', 'partial', 'cleared'))
);

-- Table 2: Deficit records linking underpaid recipient to non-paying member
CREATE TABLE public.chama_cycle_deficits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  recipient_member_id UUID NOT NULL REFERENCES public.chama_members(id) ON DELETE CASCADE,
  non_payer_member_id UUID NOT NULL REFERENCES public.chama_members(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES public.chama_member_debts(id) ON DELETE CASCADE,
  principal_amount NUMERIC(15,2) NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  net_owed_to_recipient NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'outstanding',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chama_cycle_deficits_status_check CHECK (status IN ('outstanding', 'paid'))
);

-- Add idempotency key to contributions to prevent double-processing
ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create unique index on idempotency_key (partial, only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS contributions_idempotency_key_idx
  ON public.contributions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chama_member_debts_member ON public.chama_member_debts(member_id, status);
CREATE INDEX IF NOT EXISTS idx_chama_member_debts_chama ON public.chama_member_debts(chama_id);
CREATE INDEX IF NOT EXISTS idx_chama_member_debts_cycle ON public.chama_member_debts(cycle_id);
CREATE INDEX IF NOT EXISTS idx_chama_cycle_deficits_recipient ON public.chama_cycle_deficits(recipient_member_id, status);
CREATE INDEX IF NOT EXISTS idx_chama_cycle_deficits_nonpayer ON public.chama_cycle_deficits(non_payer_member_id);
CREATE INDEX IF NOT EXISTS idx_chama_cycle_deficits_debt ON public.chama_cycle_deficits(debt_id);

-- RLS for chama_member_debts
ALTER TABLE public.chama_member_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their own debts"
  ON public.chama_member_debts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chama_members cm
    WHERE cm.id = chama_member_debts.member_id
    AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Managers can view all debts in their chama"
  ON public.chama_member_debts FOR SELECT
  USING (public.is_chama_manager(auth.uid(), chama_id));

CREATE POLICY "Admins can view all debts"
  ON public.chama_member_debts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert debts"
  ON public.chama_member_debts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update debts"
  ON public.chama_member_debts FOR UPDATE
  USING (true);

-- RLS for chama_cycle_deficits
ALTER TABLE public.chama_cycle_deficits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved members can view deficits"
  ON public.chama_cycle_deficits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chama_members cm
      WHERE (cm.id = chama_cycle_deficits.recipient_member_id OR cm.id = chama_cycle_deficits.non_payer_member_id)
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can view all deficits in their chama"
  ON public.chama_cycle_deficits FOR SELECT
  USING (public.is_chama_manager(auth.uid(), chama_id));

CREATE POLICY "Admins can view all deficits"
  ON public.chama_cycle_deficits FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert deficits"
  ON public.chama_cycle_deficits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update deficits"
  ON public.chama_cycle_deficits FOR UPDATE
  USING (true);
