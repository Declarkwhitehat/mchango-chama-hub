-- Create saving groups table
CREATE TABLE public.saving_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  manager_id UUID NOT NULL REFERENCES auth.users(id),
  cycle_start_date TIMESTAMPTZ NOT NULL,
  cycle_end_date TIMESTAMPTZ NOT NULL,
  whatsapp_link TEXT,
  monthly_target NUMERIC NOT NULL DEFAULT 2000,
  total_group_savings NUMERIC NOT NULL DEFAULT 0,
  group_profit_pool NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create saving group members table
CREATE TABLE public.saving_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.saving_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_savings NUMERIC NOT NULL DEFAULT 0,
  lifetime_deposits NUMERIC NOT NULL DEFAULT 0,
  is_loan_eligible BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE(group_id, user_id)
);

-- Create saving deposits table
CREATE TABLE public.saving_deposits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.saving_groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.saving_group_members(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  paid_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  gross_amount NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  net_amount NUMERIC NOT NULL,
  deposit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  balance_after NUMERIC NOT NULL,
  notes TEXT,
  payment_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create saving loans table
CREATE TABLE public.saving_loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.saving_groups(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES public.saving_group_members(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  interest_rate NUMERIC NOT NULL DEFAULT 0.1,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  due_date TIMESTAMPTZ,
  repaid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saving_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saving_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saving_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saving_loans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for saving_groups
CREATE POLICY "Members can view their groups"
  ON public.saving_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.saving_group_members
      WHERE group_id = saving_groups.id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Verified users can create groups"
  ON public.saving_groups FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND kyc_status = 'approved'
    )
  );

CREATE POLICY "Managers can update their groups"
  ON public.saving_groups FOR UPDATE
  USING (auth.uid() = manager_id);

-- RLS Policies for saving_group_members
CREATE POLICY "Members can view group members"
  ON public.saving_group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.saving_group_members sgm
      WHERE sgm.group_id = saving_group_members.group_id
      AND sgm.user_id = auth.uid()
      AND sgm.status = 'active'
    )
  );

CREATE POLICY "Users can join groups"
  ON public.saving_group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Managers can update members"
  ON public.saving_group_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.saving_groups
      WHERE id = saving_group_members.group_id
      AND manager_id = auth.uid()
    )
  );

-- RLS Policies for saving_deposits
CREATE POLICY "Members can view group deposits"
  ON public.saving_deposits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.saving_group_members
      WHERE group_id = saving_deposits.group_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Members can create deposits"
  ON public.saving_deposits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.saving_group_members
      WHERE group_id = saving_deposits.group_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

-- RLS Policies for saving_loans
CREATE POLICY "Members can view group loans"
  ON public.saving_loans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.saving_group_members
      WHERE group_id = saving_loans.group_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Members can request loans"
  ON public.saving_loans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.saving_group_members
      WHERE id = saving_loans.borrower_id
      AND user_id = auth.uid()
      AND is_loan_eligible = true
    )
  );

CREATE POLICY "Managers can update loans"
  ON public.saving_loans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.saving_groups
      WHERE id = saving_loans.group_id
      AND manager_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_saving_groups_updated_at
  BEFORE UPDATE ON public.saving_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate loan pool available (30% of TGS minus active loans)
CREATE OR REPLACE FUNCTION public.calculate_loan_pool_available(p_group_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_savings NUMERIC;
  v_active_loans NUMERIC;
  v_loan_pool NUMERIC;
BEGIN
  SELECT total_group_savings INTO v_total_savings
  FROM saving_groups
  WHERE id = p_group_id;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_active_loans
  FROM saving_loans
  WHERE group_id = p_group_id
  AND status = 'active';
  
  v_loan_pool := (v_total_savings * 0.30) - v_active_loans;
  
  RETURN GREATEST(v_loan_pool, 0);
END;
$$;

-- Function to check loan eligibility (KSh 2,000/month for 3 consecutive months + no active loan)
CREATE OR REPLACE FUNCTION public.check_loan_eligibility(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_group_id UUID;
  v_has_active_loan BOOLEAN;
  v_eligible BOOLEAN := false;
  v_month_count INTEGER := 0;
  v_month DATE;
BEGIN
  -- Get member info
  SELECT user_id, group_id INTO v_user_id, v_group_id
  FROM saving_group_members
  WHERE id = p_member_id;
  
  -- Check for active loans
  SELECT EXISTS(
    SELECT 1 FROM saving_loans sl
    JOIN saving_group_members sgm ON sl.borrower_id = sgm.id
    WHERE sgm.user_id = v_user_id
    AND sl.group_id = v_group_id
    AND sl.status = 'active'
  ) INTO v_has_active_loan;
  
  IF v_has_active_loan THEN
    RETURN false;
  END IF;
  
  -- Check last 3 months for KSh 2,000+ deposits each month
  FOR i IN 0..2 LOOP
    v_month := DATE_TRUNC('month', CURRENT_DATE - (i || ' months')::INTERVAL);
    
    IF EXISTS(
      SELECT 1
      FROM saving_deposits sd
      JOIN saving_group_members sgm ON sd.member_id = sgm.id
      WHERE sgm.user_id = v_user_id
      AND sd.group_id = v_group_id
      AND DATE_TRUNC('month', sd.deposit_date) = v_month
      GROUP BY DATE_TRUNC('month', sd.deposit_date)
      HAVING SUM(sd.net_amount) >= 2000
    ) THEN
      v_month_count := v_month_count + 1;
    ELSE
      EXIT; -- Break if any month doesn't meet requirement
    END IF;
  END LOOP;
  
  RETURN v_month_count >= 3;
END;
$$;