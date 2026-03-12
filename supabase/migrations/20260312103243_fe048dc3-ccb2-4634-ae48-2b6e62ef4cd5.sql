
-- ═══ PERFORMANCE INDEXES MIGRATION ═══

-- contributions table
CREATE INDEX IF NOT EXISTS idx_contributions_chama_status ON public.contributions(chama_id, status);
CREATE INDEX IF NOT EXISTS idx_contributions_member_status ON public.contributions(member_id, status);
CREATE INDEX IF NOT EXISTS idx_contributions_created_at_desc ON public.contributions(created_at DESC);

-- transactions table
CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);

-- withdrawals table
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_by ON public.withdrawals(requested_by);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created ON public.withdrawals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_chama_id ON public.withdrawals(chama_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_welfare_id ON public.withdrawals(welfare_id);

-- mchango_donations table
CREATE INDEX IF NOT EXISTS idx_mchango_donations_user_created ON public.mchango_donations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mchango_donations_mchango_id ON public.mchango_donations(mchango_id);

-- organization_donations table
CREATE INDEX IF NOT EXISTS idx_org_donations_user_created ON public.organization_donations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_donations_org_id ON public.organization_donations(organization_id);

-- welfare_contributions table
CREATE INDEX IF NOT EXISTS idx_welfare_contrib_welfare_user ON public.welfare_contributions(welfare_id, user_id);
CREATE INDEX IF NOT EXISTS idx_welfare_contrib_member ON public.welfare_contributions(member_id);

-- welfare_members table
CREATE INDEX IF NOT EXISTS idx_welfare_members_welfare_user_status ON public.welfare_members(welfare_id, user_id, status);

-- notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON public.notifications(user_id, is_read, created_at DESC);

-- financial_ledger table
CREATE INDEX IF NOT EXISTS idx_ledger_source_created ON public.financial_ledger(source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_reference_id ON public.financial_ledger(reference_id);

-- company_earnings table
CREATE INDEX IF NOT EXISTS idx_company_earnings_group ON public.company_earnings(group_id);

-- member_cycle_payments table
CREATE INDEX IF NOT EXISTS idx_mcp_cycle_member ON public.member_cycle_payments(cycle_id, member_id);
CREATE INDEX IF NOT EXISTS idx_mcp_member_paid ON public.member_cycle_payments(member_id, is_paid);

-- chama_member_debts table
CREATE INDEX IF NOT EXISTS idx_debts_member_status ON public.chama_member_debts(member_id, status);

-- chama_cycle_deficits table
CREATE INDEX IF NOT EXISTS idx_deficits_nonpayer_status ON public.chama_cycle_deficits(non_payer_member_id, status);

-- contribution_cycles table
CREATE INDEX IF NOT EXISTS idx_cycles_chama_complete ON public.contribution_cycles(chama_id, is_complete);

-- audit_logs table
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON public.audit_logs(user_id, created_at DESC);

-- chama_members table
CREATE INDEX IF NOT EXISTS idx_chama_members_chama_approval_status ON public.chama_members(chama_id, approval_status, status);
CREATE INDEX IF NOT EXISTS idx_chama_members_user_id ON public.chama_members(user_id);

-- profiles table (for phone lookups and KYC filtering)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status ON public.profiles(kyc_status);
