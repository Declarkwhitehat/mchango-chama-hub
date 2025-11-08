-- Add new columns to the existing saving_groups table
ALTER TABLE saving_groups
ADD COLUMN saving_goal NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN max_members INTEGER NOT NULL DEFAULT 100,
ADD COLUMN whatsapp_group_link TEXT,
ADD COLUMN total_savings NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN total_profits NUMERIC(18, 2) NOT NULL DEFAULT 0.00;

-- Create the deposits table
CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    saving_group_id UUID REFERENCES saving_groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    payer_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL, -- Who paid (can be different from user_id)
    amount NUMERIC(18, 2) NOT NULL,
    commission_amount NUMERIC(18, 2) NOT NULL, -- 1% commission
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the loans table
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    saving_group_id UUID REFERENCES saving_groups(id) ON DELETE CASCADE NOT NULL,
    borrower_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    requested_amount NUMERIC(18, 2) NOT NULL,
    disbursed_amount NUMERIC(18, 2) NOT NULL, -- Amount sent to borrower
    principal_amount NUMERIC(18, 2) NOT NULL, -- Amount to be repaid (requested_amount)
    commission_deducted NUMERIC(18, 2) NOT NULL, -- 2% company commission
    profit_deducted NUMERIC(18, 2) NOT NULL, -- 5% group profit
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL', -- PENDING_APPROVAL, APPROVED, DISBURSED, REPAID, DEFAULTED
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    repaid_at TIMESTAMP WITH TIME ZONE
);

-- Create the loan_approvals table
CREATE TABLE loan_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE NOT NULL,
    approver_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (loan_id, approver_id)
);

-- Create the loan_guarantors table (for default policy)
CREATE TABLE loan_guarantors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE NOT NULL,
    guarantor_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    default_share NUMERIC(18, 2) NOT NULL DEFAULT 0.00, -- Amount deducted from guarantor's savings
    is_refunded BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (loan_id, guarantor_id)
);

-- Create the loan_repayments table
CREATE TABLE loan_repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the profit_distributions table
CREATE TABLE profit_distributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    saving_group_id UUID REFERENCES saving_groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    cycle_end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Function to update total_savings on new deposit
CREATE OR REPLACE FUNCTION update_group_savings_on_deposit()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE saving_groups
    SET total_savings = total_savings + NEW.amount
    WHERE id = NEW.saving_group_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for deposits
CREATE TRIGGER deposits_after_insert
AFTER INSERT ON deposits
FOR EACH ROW EXECUTE FUNCTION update_group_savings_on_deposit();
