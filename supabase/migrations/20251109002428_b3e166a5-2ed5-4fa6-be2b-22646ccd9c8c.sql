-- Add new columns to the existing saving_groups table
ALTER TABLE saving_groups
ADD COLUMN IF NOT EXISTS saving_goal NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS max_members INTEGER NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT,
ADD COLUMN IF NOT EXISTS total_savings NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_profits NUMERIC(18, 2) NOT NULL DEFAULT 0.00;

-- Create the deposits table (for saving group deposits)
CREATE TABLE IF NOT EXISTS saving_group_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saving_group_id UUID REFERENCES saving_groups(id) ON DELETE CASCADE NOT NULL,
    member_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    payer_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 100),
    commission_amount NUMERIC(18, 2) NOT NULL,
    net_amount NUMERIC(18, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the loans table
CREATE TABLE IF NOT EXISTS saving_group_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saving_group_id UUID REFERENCES saving_groups(id) ON DELETE CASCADE NOT NULL,
    borrower_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    requested_amount NUMERIC(18, 2) NOT NULL,
    disbursed_amount NUMERIC(18, 2) NOT NULL,
    principal_amount NUMERIC(18, 2) NOT NULL,
    commission_deducted NUMERIC(18, 2) NOT NULL,
    profit_deducted NUMERIC(18, 2) NOT NULL,
    interest_rate NUMERIC(5, 2) NOT NULL DEFAULT 6.5,
    insurance_fee_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.0,
    total_repayment_amount NUMERIC(18, 2) NOT NULL,
    balance_remaining NUMERIC(18, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    disbursed_at TIMESTAMP WITH TIME ZONE,
    due_date DATE NOT NULL,
    repaid_at TIMESTAMP WITH TIME ZONE,
    defaulted_at TIMESTAMP WITH TIME ZONE
);

-- Create loan guarantors table
CREATE TABLE IF NOT EXISTS saving_group_loan_guarantors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID REFERENCES saving_group_loans(id) ON DELETE CASCADE NOT NULL,
    guarantor_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_default_payer BOOLEAN NOT NULL DEFAULT FALSE,
    default_payment_amount NUMERIC(18, 2) DEFAULT 0.00,
    UNIQUE(loan_id, guarantor_user_id)
);

-- Create loan repayments table
CREATE TABLE IF NOT EXISTS saving_group_loan_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID REFERENCES saving_group_loans(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create profit distributions table
CREATE TABLE IF NOT EXISTS saving_group_profit_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saving_group_id UUID REFERENCES saving_groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    cycle_end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on new tables
ALTER TABLE saving_group_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_group_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_group_loan_guarantors ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_group_loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_group_profit_distributions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for deposits
CREATE POLICY "Members can view group deposits"
ON saving_group_deposits FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_members
    WHERE saving_group_members.group_id = saving_group_deposits.saving_group_id
    AND saving_group_members.user_id = auth.uid()
    AND saving_group_members.status = 'active'
  )
);

CREATE POLICY "Members can create deposits"
ON saving_group_deposits FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM saving_group_members
    WHERE saving_group_members.group_id = saving_group_deposits.saving_group_id
    AND saving_group_members.user_id = auth.uid()
    AND saving_group_members.status = 'active'
  )
);

-- RLS Policies for loans
CREATE POLICY "Members can view group loans"
ON saving_group_loans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_members
    WHERE saving_group_members.group_id = saving_group_loans.saving_group_id
    AND saving_group_members.user_id = auth.uid()
    AND saving_group_members.status = 'active'
  )
);

CREATE POLICY "Eligible members can request loans"
ON saving_group_loans FOR INSERT
WITH CHECK (
  auth.uid() = borrower_user_id
  AND EXISTS (
    SELECT 1 FROM saving_group_members
    WHERE saving_group_members.group_id = saving_group_loans.saving_group_id
    AND saving_group_members.user_id = auth.uid()
    AND saving_group_members.is_loan_eligible = true
    AND saving_group_members.status = 'active'
  )
);

CREATE POLICY "Managers can update loans"
ON saving_group_loans FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM saving_groups
    WHERE saving_groups.id = saving_group_loans.saving_group_id
    AND saving_groups.manager_id = auth.uid()
  )
);

-- RLS Policies for guarantors
CREATE POLICY "Members can view loan guarantors"
ON saving_group_loan_guarantors FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_loans l
    JOIN saving_group_members m ON m.group_id = l.saving_group_id
    WHERE l.id = saving_group_loan_guarantors.loan_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  )
);

CREATE POLICY "Members can guarantee loans"
ON saving_group_loan_guarantors FOR INSERT
WITH CHECK (
  auth.uid() = guarantor_user_id
  AND EXISTS (
    SELECT 1 FROM saving_group_loans l
    JOIN saving_group_members m ON m.group_id = l.saving_group_id
    WHERE l.id = saving_group_loan_guarantors.loan_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  )
);

-- RLS Policies for repayments
CREATE POLICY "Members can view loan repayments"
ON saving_group_loan_repayments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM saving_group_loans l
    JOIN saving_group_members m ON m.group_id = l.saving_group_id
    WHERE l.id = saving_group_loan_repayments.loan_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  )
);

-- RLS Policies for profit distributions
CREATE POLICY "Members can view their profit distributions"
ON saving_group_profit_distributions FOR SELECT
USING (auth.uid() = user_id);

-- Function to update total_savings on new deposit
CREATE OR REPLACE FUNCTION update_group_savings_on_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE saving_groups
    SET total_savings = total_savings + NEW.net_amount
    WHERE id = NEW.saving_group_id;
    RETURN NEW;
END;
$$;

-- Trigger for deposits
CREATE TRIGGER saving_group_deposits_after_insert
AFTER INSERT ON saving_group_deposits
FOR EACH ROW EXECUTE FUNCTION update_group_savings_on_deposit();

-- Function to update member savings on deposit
CREATE OR REPLACE FUNCTION update_member_savings_on_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE saving_group_members
    SET 
        current_savings = current_savings + NEW.net_amount,
        lifetime_deposits = lifetime_deposits + NEW.net_amount
    WHERE group_id = NEW.saving_group_id
    AND user_id = NEW.member_user_id;
    RETURN NEW;
END;
$$;

-- Trigger for member savings update
CREATE TRIGGER saving_group_deposits_update_member
AFTER INSERT ON saving_group_deposits
FOR EACH ROW EXECUTE FUNCTION update_member_savings_on_deposit();