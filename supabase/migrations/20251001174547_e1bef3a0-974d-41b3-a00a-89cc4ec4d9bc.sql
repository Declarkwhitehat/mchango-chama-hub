-- Create ENUMS
CREATE TYPE public.mchango_status AS ENUM ('active', 'completed', 'cancelled');
CREATE TYPE public.chama_status AS ENUM ('active', 'inactive', 'completed');
CREATE TYPE public.contribution_frequency AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE public.member_status AS ENUM ('active', 'inactive', 'left');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE public.transaction_type AS ENUM ('donation', 'contribution', 'payout');
CREATE TYPE public.payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Create mchango table
CREATE TABLE public.mchango (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  goal_amount NUMERIC(12, 2) NOT NULL CHECK (goal_amount > 0),
  current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  image_url TEXT,
  category TEXT,
  whatsapp_link TEXT,
  status mchango_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_mchango_created_by ON public.mchango(created_by);
CREATE INDEX idx_mchango_status ON public.mchango(status);
CREATE INDEX idx_mchango_slug ON public.mchango(slug);

-- Create chama table
CREATE TABLE public.chama (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  contribution_amount NUMERIC(12, 2) NOT NULL CHECK (contribution_amount > 0),
  contribution_frequency contribution_frequency NOT NULL,
  whatsapp_link TEXT,
  max_members INTEGER NOT NULL DEFAULT 50 CHECK (max_members > 0),
  status chama_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_chama_created_by ON public.chama(created_by);
CREATE INDEX idx_chama_status ON public.chama(status);
CREATE INDEX idx_chama_slug ON public.chama(slug);

-- Create chama_members table
CREATE TABLE public.chama_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID REFERENCES public.chama(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_code TEXT NOT NULL,
  is_manager BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status member_status NOT NULL DEFAULT 'active',
  UNIQUE(chama_id, member_code),
  UNIQUE(chama_id, user_id)
);

CREATE INDEX idx_chama_members_chama ON public.chama_members(chama_id);
CREATE INDEX idx_chama_members_user ON public.chama_members(user_id);
CREATE INDEX idx_chama_members_code ON public.chama_members(chama_id, member_code);

-- Create contributions table
CREATE TABLE public.contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID REFERENCES public.chama(id) ON DELETE CASCADE NOT NULL,
  member_id UUID REFERENCES public.chama_members(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_reference TEXT NOT NULL,
  contribution_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status transaction_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_contributions_chama ON public.contributions(chama_id);
CREATE INDEX idx_contributions_member ON public.contributions(member_id);
CREATE INDEX idx_contributions_date ON public.contributions(contribution_date);
CREATE INDEX idx_contributions_ref ON public.contributions(payment_reference);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  mchango_id UUID REFERENCES public.mchango(id) ON DELETE SET NULL,
  chama_id UUID REFERENCES public.chama(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_reference TEXT NOT NULL UNIQUE,
  payment_method TEXT,
  status transaction_status NOT NULL DEFAULT 'pending',
  transaction_type transaction_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user ON public.transactions(user_id);
CREATE INDEX idx_transactions_mchango ON public.transactions(mchango_id);
CREATE INDEX idx_transactions_chama ON public.transactions(chama_id);
CREATE INDEX idx_transactions_ref ON public.transactions(payment_reference);
CREATE INDEX idx_transactions_status ON public.transactions(status);

-- Create payouts table
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mchango_id UUID REFERENCES public.mchango(id) ON DELETE SET NULL,
  chama_id UUID REFERENCES public.chama(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_reference TEXT,
  status payout_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_payouts_mchango ON public.payouts(mchango_id);
CREATE INDEX idx_payouts_chama ON public.payouts(chama_id);
CREATE INDEX idx_payouts_recipient ON public.payouts(recipient_id);
CREATE INDEX idx_payouts_status ON public.payouts(status);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_table ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_record ON public.audit_logs(record_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);

-- Enable RLS on all tables
ALTER TABLE public.mchango ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chama ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chama_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mchango
CREATE POLICY "Anyone can view active mchangos"
  ON public.mchango FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can create their own mchangos"
  ON public.mchango FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own mchangos"
  ON public.mchango FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Admins can view all mchangos"
  ON public.mchango FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for chama
CREATE POLICY "Anyone can view active chamas"
  ON public.chama FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can create their own chamas"
  ON public.chama FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own chamas"
  ON public.chama FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Chama managers can update chama"
  ON public.chama FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.chama_members
      WHERE chama_id = chama.id
        AND user_id = auth.uid()
        AND is_manager = true
        AND status = 'active'
    )
  );

-- RLS Policies for chama_members
CREATE POLICY "Users can view members of their chamas"
  ON public.chama_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.chama_members cm
      WHERE cm.chama_id = chama_members.chama_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Chama creators can insert members"
  ON public.chama_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chama
      WHERE id = chama_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Managers can update members"
  ON public.chama_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.chama_members
      WHERE chama_id = chama_members.chama_id
        AND user_id = auth.uid()
        AND is_manager = true
    )
  );

-- RLS Policies for contributions
CREATE POLICY "Members can view contributions in their chama"
  ON public.contributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chama_members
      WHERE chama_id = contributions.chama_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create contributions"
  ON public.contributions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chama_members
      WHERE id = member_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for transactions
CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for payouts
CREATE POLICY "Recipients can view their payouts"
  ON public.payouts FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Admins can manage payouts"
  ON public.payouts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for audit_logs
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at on mchango
CREATE TRIGGER update_mchango_updated_at
  BEFORE UPDATE ON public.mchango
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on chama
CREATE TRIGGER update_chama_updated_at
  BEFORE UPDATE ON public.chama
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate slug
CREATE OR REPLACE FUNCTION public.generate_slug(title TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
END;
$$;

-- Function to update mchango current_amount when transaction is completed
CREATE OR REPLACE FUNCTION public.update_mchango_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.mchango_id IS NOT NULL AND NEW.transaction_type = 'donation' THEN
    UPDATE public.mchango
    SET current_amount = current_amount + NEW.amount
    WHERE id = NEW.mchango_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transaction_update_mchango
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_mchango_amount();