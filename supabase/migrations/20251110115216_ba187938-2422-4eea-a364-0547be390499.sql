-- ============================================
-- SAVING GROUPS DATABASE SCHEMA (FIXED)
-- ============================================

-- 1. Update saving_groups table
ALTER TABLE saving_groups 
ADD COLUMN IF NOT EXISTS profile_picture TEXT,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;

-- 2. Update saving_group_members table
ALTER TABLE saving_group_members
ADD COLUMN IF NOT EXISTS unique_member_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_saving_group_members_unique_id ON saving_group_members(unique_member_id);

-- 3. Update saving_group_deposits table
ALTER TABLE saving_group_deposits
ADD COLUMN IF NOT EXISTS saved_for_member_id UUID REFERENCES saving_group_members(id),
ADD COLUMN IF NOT EXISTS profit_fee NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_deposits_saved_for ON saving_group_deposits(saved_for_member_id);

-- 4. Update saving_group_loans table
ALTER TABLE saving_group_loans
ADD COLUMN IF NOT EXISTS waitlist BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS repayment_due_date DATE;

-- 5. Create group_transactions table
CREATE TABLE IF NOT EXISTS saving_group_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES saving_groups(id) ON DELETE CASCADE,
  member_id UUID REFERENCES saving_group_members(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('SAVING', 'LOAN', 'LOAN_REPAYMENT', 'PROFIT_DISTRIBUTION', 'WITHDRAWAL')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_transactions_group ON saving_group_transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_transactions_member ON saving_group_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_group_transactions_type ON saving_group_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_group_transactions_date ON saving_group_transactions(created_at);

-- 6. Create group_profits table
CREATE TABLE IF NOT EXISTS saving_group_profits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES saving_groups(id) ON DELETE CASCADE,
  cycle_period TEXT NOT NULL,
  total_profit NUMERIC NOT NULL DEFAULT 0 CHECK (total_profit >= 0),
  distributed BOOLEAN DEFAULT FALSE,
  distribution_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  UNIQUE(group_id, cycle_period)
);

CREATE INDEX IF NOT EXISTS idx_group_profits_group ON saving_group_profits(group_id);

-- 7. Create profit_shares table
CREATE TABLE IF NOT EXISTS saving_group_profit_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_id UUID NOT NULL REFERENCES saving_group_profits(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES saving_group_members(id) ON DELETE CASCADE,
  share_amount NUMERIC NOT NULL DEFAULT 0 CHECK (share_amount >= 0),
  savings_ratio NUMERIC NOT NULL DEFAULT 0,
  disbursed BOOLEAN DEFAULT FALSE,
  disbursed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  UNIQUE(profit_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_profit_shares_profit ON saving_group_profit_shares(profit_id);
CREATE INDEX IF NOT EXISTS idx_profit_shares_member ON saving_group_profit_shares(member_id);

-- 8. Create company_earnings table
CREATE TABLE IF NOT EXISTS company_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('COMMISSION', 'LOAN_FEES', 'WITHDRAWAL_FEES', 'OTHER')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  group_id UUID REFERENCES saving_groups(id) ON DELETE SET NULL,
  reference_id UUID,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_earnings_source ON company_earnings(source);
CREATE INDEX IF NOT EXISTS idx_company_earnings_group ON company_earnings(group_id);
CREATE INDEX IF NOT EXISTS idx_company_earnings_date ON company_earnings(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE saving_group_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_group_profits ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_group_profit_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_earnings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Members can view their group transactions" ON saving_group_transactions;
DROP POLICY IF EXISTS "System can insert transactions" ON saving_group_transactions;
DROP POLICY IF EXISTS "Members can view their group profits" ON saving_group_profits;
DROP POLICY IF EXISTS "Managers can manage group profits" ON saving_group_profits;
DROP POLICY IF EXISTS "Members can view their own profit shares" ON saving_group_profit_shares;
DROP POLICY IF EXISTS "Members can view group profit shares" ON saving_group_profit_shares;
DROP POLICY IF EXISTS "Admins can view company earnings" ON company_earnings;
DROP POLICY IF EXISTS "Admins can manage company earnings" ON company_earnings;

-- Create policies for saving_group_transactions
CREATE POLICY "Members can view their group transactions"
ON saving_group_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_members
    WHERE saving_group_members.group_id = saving_group_transactions.group_id
    AND saving_group_members.user_id = auth.uid()
    AND saving_group_members.status = 'active'
  )
);

CREATE POLICY "System can insert transactions"
ON saving_group_transactions FOR INSERT
WITH CHECK (true);

-- Create policies for saving_group_profits
CREATE POLICY "Members can view their group profits"
ON saving_group_profits FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_members
    WHERE saving_group_members.group_id = saving_group_profits.group_id
    AND saving_group_members.user_id = auth.uid()
    AND saving_group_members.status = 'active'
  )
);

CREATE POLICY "Managers can manage group profits"
ON saving_group_profits FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM saving_groups
    WHERE saving_groups.id = saving_group_profits.group_id
    AND saving_groups.manager_id = auth.uid()
  )
);

-- Create policies for saving_group_profit_shares
CREATE POLICY "Members can view their own profit shares"
ON saving_group_profit_shares FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_members
    WHERE saving_group_members.id = saving_group_profit_shares.member_id
    AND saving_group_members.user_id = auth.uid()
  )
);

CREATE POLICY "Members can view group profit shares"
ON saving_group_profit_shares FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_members sgm1
    JOIN saving_group_members sgm2 ON sgm1.group_id = sgm2.group_id
    WHERE sgm2.id = saving_group_profit_shares.member_id
    AND sgm1.user_id = auth.uid()
    AND sgm1.status = 'active'
  )
);

-- Create policies for company_earnings
CREATE POLICY "Admins can view company earnings"
ON company_earnings FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage company earnings"
ON company_earnings FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION generate_unique_member_id(p_group_id UUID, p_member_number INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_slug TEXT;
  v_member_id TEXT;
BEGIN
  SELECT slug INTO v_group_slug FROM saving_groups WHERE id = p_group_id;
  v_member_id := UPPER(SUBSTRING(v_group_slug FROM 1 FOR 5)) || '-M' || LPAD(p_member_number::TEXT, 4, '0');
  RETURN v_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_available_loan_pool(p_group_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_savings NUMERIC;
  v_active_loans NUMERIC;
  v_available NUMERIC;
BEGIN
  SELECT COALESCE(total_savings, 0) INTO v_total_savings
  FROM saving_groups WHERE id = p_group_id;
  
  SELECT COALESCE(SUM(balance_remaining), 0) INTO v_active_loans
  FROM saving_group_loans
  WHERE saving_group_id = p_group_id
  AND status IN ('PENDING_APPROVAL', 'APPROVED', 'DISBURSED');
  
  v_available := (v_total_savings * 0.30) - v_active_loans;
  RETURN GREATEST(v_available, 0);
END;
$$;

CREATE OR REPLACE FUNCTION record_company_earning(
  p_source TEXT,
  p_amount NUMERIC,
  p_group_id UUID DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earning_id UUID;
BEGIN
  INSERT INTO company_earnings (source, amount, group_id, reference_id, description)
  VALUES (p_source, p_amount, p_group_id, p_reference_id, p_description)
  RETURNING id INTO v_earning_id;
  
  RETURN v_earning_id;
END;
$$;