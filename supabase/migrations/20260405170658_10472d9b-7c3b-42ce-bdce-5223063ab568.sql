
-- Update check constraint to include VERIFICATION_FEE
ALTER TABLE company_earnings DROP CONSTRAINT company_earnings_source_check;
ALTER TABLE company_earnings ADD CONSTRAINT company_earnings_source_check 
  CHECK (source = ANY (ARRAY['COMMISSION', 'LOAN_FEES', 'WITHDRAWAL_FEES', 'VERIFICATION_FEE', 'OTHER']));
