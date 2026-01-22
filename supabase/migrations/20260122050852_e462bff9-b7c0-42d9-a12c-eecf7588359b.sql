-- Add RLS policy to allow viewing pending public chamas
CREATE POLICY "Anyone can view pending public chamas"
ON public.chama
FOR SELECT
USING (status = 'pending' AND is_public = true);

-- Drop all savings group tables (they're no longer used)
DROP TABLE IF EXISTS public.saving_group_profit_distributions CASCADE;
DROP TABLE IF EXISTS public.saving_group_profit_shares CASCADE;
DROP TABLE IF EXISTS public.saving_group_profits CASCADE;
DROP TABLE IF EXISTS public.saving_group_loan_guarantors CASCADE;
DROP TABLE IF EXISTS public.saving_group_loan_repayments CASCADE;
DROP TABLE IF EXISTS public.saving_group_loans CASCADE;
DROP TABLE IF EXISTS public.saving_group_deposits CASCADE;
DROP TABLE IF EXISTS public.saving_group_transactions CASCADE;
DROP TABLE IF EXISTS public.saving_group_invite_codes CASCADE;
DROP TABLE IF EXISTS public.saving_group_members CASCADE;
DROP TABLE IF EXISTS public.saving_groups CASCADE;
DROP TABLE IF EXISTS public.saving_deposits CASCADE;
DROP TABLE IF EXISTS public.saving_loans CASCADE;