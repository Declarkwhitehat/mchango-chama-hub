
-- =============================================
-- ONLINE WELFARE SYSTEM - Database Schema
-- =============================================

-- 1. Create welfares table FIRST
CREATE TABLE public.welfares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  group_code text,
  paybill_account_id text,
  contribution_amount numeric DEFAULT 0,
  contribution_frequency text DEFAULT 'monthly',
  contribution_deadline_days integer DEFAULT 7,
  min_contribution_period_months integer DEFAULT 3,
  commission_rate numeric DEFAULT 0.05,
  total_gross_collected numeric DEFAULT 0,
  total_commission_paid numeric DEFAULT 0,
  available_balance numeric DEFAULT 0,
  current_amount numeric DEFAULT 0,
  total_withdrawn numeric DEFAULT 0,
  is_public boolean DEFAULT true,
  is_frozen boolean DEFAULT false,
  frozen_at timestamptz,
  frozen_reason text,
  whatsapp_link text,
  status text NOT NULL DEFAULT 'active',
  is_verified boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create welfare_members table
CREATE TABLE public.welfare_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_id uuid NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  member_code text,
  status text NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  total_contributed numeric DEFAULT 0,
  is_eligible_for_withdrawal boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(welfare_id, user_id)
);

-- 3. Add welfare_id to withdrawals
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS welfare_id uuid REFERENCES public.welfares(id);

-- 4. Create welfare_contributions table
CREATE TABLE public.welfare_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_id uuid NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.welfare_members(id),
  user_id uuid NOT NULL,
  gross_amount numeric NOT NULL,
  commission_amount numeric DEFAULT 0,
  net_amount numeric NOT NULL,
  payment_reference text NOT NULL,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'pending',
  mpesa_receipt_number text,
  cycle_month text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 5. Create welfare_withdrawal_approvals table
CREATE TABLE public.welfare_withdrawal_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  welfare_id uuid NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES public.welfare_members(id),
  approver_role text NOT NULL,
  decision text NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Create welfare_contribution_cycles table
CREATE TABLE public.welfare_contribution_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_id uuid NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  set_by uuid NOT NULL,
  amount numeric NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- HELPER FUNCTIONS (tables exist now)
-- =============================================

CREATE OR REPLACE FUNCTION public.is_welfare_member(_user_id uuid, _welfare_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.welfare_members
    WHERE welfare_id = _welfare_id AND user_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_welfare_role(_user_id uuid, _welfare_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT role FROM public.welfare_members
  WHERE welfare_id = _welfare_id AND user_id = _user_id AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_welfare_chairman(_user_id uuid, _welfare_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.welfare_members
    WHERE welfare_id = _welfare_id AND user_id = _user_id AND role = 'chairman' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_welfare_secretary(_user_id uuid, _welfare_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.welfare_members
    WHERE welfare_id = _welfare_id AND user_id = _user_id AND role = 'secretary' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_welfare_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_code TEXT; v_exists BOOLEAN; v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..4 LOOP v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1); END LOOP;
    SELECT EXISTS(SELECT 1 FROM welfares WHERE group_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_welfare_paybill_account_id()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_code TEXT; v_full_id TEXT; v_exists BOOLEAN; v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1); END LOOP;
    v_full_id := 'WF' || v_code;
    SELECT EXISTS(SELECT 1 FROM welfares WHERE paybill_account_id = v_full_id UNION ALL SELECT 1 FROM mchango WHERE paybill_account_id = v_full_id UNION ALL SELECT 1 FROM organizations WHERE paybill_account_id = v_full_id) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_full_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_welfare_member_code(p_welfare_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_group_code TEXT; v_suffix TEXT; v_full_code TEXT; v_exists BOOLEAN; v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_attempt INTEGER := 0;
BEGIN
  SELECT group_code INTO v_group_code FROM welfares WHERE id = p_welfare_id;
  IF v_group_code IS NULL THEN v_group_code := 'WF00'; END IF;
  LOOP
    v_attempt := v_attempt + 1; v_suffix := '';
    FOR i IN 1..4 LOOP v_suffix := v_suffix || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1); END LOOP;
    v_full_code := v_group_code || v_suffix;
    SELECT EXISTS(SELECT 1 FROM welfare_members WHERE welfare_id = p_welfare_id AND member_code = v_full_code) INTO v_exists;
    EXIT WHEN NOT v_exists OR v_attempt >= 50;
  END LOOP;
  RETURN v_full_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_welfare_withdrawn(p_welfare_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE welfares SET 
    current_amount = GREATEST(0, COALESCE(current_amount, 0) - p_amount),
    available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_amount),
    total_withdrawn = COALESCE(total_withdrawn, 0) + p_amount
  WHERE id = p_welfare_id;
END;
$$;

-- =============================================
-- TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.assign_welfare_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.group_code IS NULL THEN NEW.group_code := generate_welfare_code(); END IF;
  IF NEW.paybill_account_id IS NULL THEN NEW.paybill_account_id := generate_welfare_paybill_account_id(); END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_assign_welfare_codes BEFORE INSERT ON public.welfares FOR EACH ROW EXECUTE FUNCTION assign_welfare_codes();
CREATE TRIGGER tr_welfares_updated_at BEFORE UPDATE ON public.welfares FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.assign_welfare_member_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.member_code IS NULL THEN NEW.member_code := generate_welfare_member_code(NEW.welfare_id); END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_assign_welfare_member_code BEFORE INSERT ON public.welfare_members FOR EACH ROW EXECUTE FUNCTION assign_welfare_member_code();

CREATE OR REPLACE FUNCTION public.add_welfare_creator_as_chairman()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.welfare_members (welfare_id, user_id, role, status) VALUES (NEW.id, NEW.created_by, 'chairman', 'active');
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_add_welfare_chairman AFTER INSERT ON public.welfares FOR EACH ROW EXECUTE FUNCTION add_welfare_creator_as_chairman();

CREATE OR REPLACE FUNCTION public.freeze_welfare_on_treasurer_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role = 'treasurer' AND NEW.role != 'treasurer' THEN
    UPDATE public.welfares SET is_frozen = true, frozen_at = now(), frozen_reason = 'Treasurer role changed. Contact admin to unfreeze.' WHERE id = OLD.welfare_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_freeze_on_treasurer_change AFTER UPDATE OF role ON public.welfare_members FOR EACH ROW EXECUTE FUNCTION freeze_welfare_on_treasurer_change();

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.welfares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_withdrawal_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_contribution_cycles ENABLE ROW LEVEL SECURITY;

-- WELFARES
CREATE POLICY "Admins can manage welfares" ON public.welfares FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active public welfares" ON public.welfares FOR SELECT USING (status = 'active' AND is_public = true);
CREATE POLICY "Members can view their welfare" ON public.welfares FOR SELECT USING (is_welfare_member(auth.uid(), id));
CREATE POLICY "Creators can view own welfares" ON public.welfares FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "KYC approved users can create welfares" ON public.welfares FOR INSERT WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND kyc_status = 'approved'::kyc_status));
CREATE POLICY "Chairman can update welfare" ON public.welfares FOR UPDATE USING (is_welfare_chairman(auth.uid(), id));

-- WELFARE_MEMBERS
CREATE POLICY "Admins can manage welfare members" ON public.welfare_members FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Members can view fellow members" ON public.welfare_members FOR SELECT USING (is_welfare_member(auth.uid(), welfare_id));
CREATE POLICY "Anyone can join welfare" ON public.welfare_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Chairman can update members" ON public.welfare_members FOR UPDATE USING (is_welfare_chairman(auth.uid(), welfare_id));

-- WELFARE_CONTRIBUTIONS
CREATE POLICY "Admins can manage wf contributions" ON public.welfare_contributions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Members can view wf contributions" ON public.welfare_contributions FOR SELECT USING (is_welfare_member(auth.uid(), welfare_id));
CREATE POLICY "Members can create wf contributions" ON public.welfare_contributions FOR INSERT WITH CHECK (auth.uid() = user_id AND is_welfare_member(auth.uid(), welfare_id));

-- WELFARE_WITHDRAWAL_APPROVALS
CREATE POLICY "Admins can manage wf approvals" ON public.welfare_withdrawal_approvals FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Members can view wf approvals" ON public.welfare_withdrawal_approvals FOR SELECT USING (is_welfare_member(auth.uid(), welfare_id));
CREATE POLICY "Approvers can update their decisions" ON public.welfare_withdrawal_approvals FOR UPDATE USING (EXISTS (SELECT 1 FROM welfare_members wm WHERE wm.id = welfare_withdrawal_approvals.approver_id AND wm.user_id = auth.uid() AND wm.status = 'active'));

-- WELFARE_CONTRIBUTION_CYCLES
CREATE POLICY "Admins can manage wf cycles" ON public.welfare_contribution_cycles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Members can view wf cycles" ON public.welfare_contribution_cycles FOR SELECT USING (is_welfare_member(auth.uid(), welfare_id));
CREATE POLICY "Secretary can create wf cycles" ON public.welfare_contribution_cycles FOR INSERT WITH CHECK (is_welfare_secretary(auth.uid(), welfare_id));
CREATE POLICY "Secretary can update wf cycles" ON public.welfare_contribution_cycles FOR UPDATE USING (is_welfare_secretary(auth.uid(), welfare_id));

-- WITHDRAWALS - welfare policies
CREATE POLICY "Welfare members can view welfare withdrawals" ON public.withdrawals FOR SELECT USING (welfare_id IS NOT NULL AND is_welfare_member(auth.uid(), welfare_id));
CREATE POLICY "Welfare executives can request withdrawals" ON public.withdrawals FOR INSERT WITH CHECK (auth.uid() = requested_by AND welfare_id IS NOT NULL AND (is_welfare_chairman(auth.uid(), welfare_id) OR get_welfare_role(auth.uid(), welfare_id) = 'treasurer'));

-- Audit triggers
CREATE TRIGGER tr_audit_welfares AFTER INSERT OR UPDATE OR DELETE ON public.welfares FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER tr_audit_welfare_members AFTER INSERT OR UPDATE OR DELETE ON public.welfare_members FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER tr_audit_welfare_contributions AFTER INSERT OR UPDATE OR DELETE ON public.welfare_contributions FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER tr_audit_welfare_approvals AFTER INSERT OR UPDATE OR DELETE ON public.welfare_withdrawal_approvals FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
