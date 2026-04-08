
-- member_cycle_payments: hot path for payout eligibility checks
CREATE INDEX IF NOT EXISTS idx_mcp_cycle_member ON public.member_cycle_payments (cycle_id, member_id);
CREATE INDEX IF NOT EXISTS idx_mcp_member_fullypaid ON public.member_cycle_payments (member_id, fully_paid);
CREATE INDEX IF NOT EXISTS idx_mcp_cycle_paid ON public.member_cycle_payments (cycle_id, is_paid, fully_paid);

-- contribution_cycles: finding unprocessed cycles quickly
CREATE INDEX IF NOT EXISTS idx_cycles_chama_payout ON public.contribution_cycles (chama_id, payout_processed, end_date);
CREATE INDEX IF NOT EXISTS idx_cycles_chama_number ON public.contribution_cycles (chama_id, cycle_number DESC);

-- withdrawals: duplicate payout prevention + status queries
CREATE INDEX IF NOT EXISTS idx_withdrawals_chama_cycle ON public.withdrawals (chama_id, cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals (status) WHERE status IN ('pending', 'approved', 'processing', 'pending_retry');
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_by ON public.withdrawals (requested_by, status);

-- chama_member_debts: eligibility checks
CREATE INDEX IF NOT EXISTS idx_debts_member_status ON public.chama_member_debts (member_id, chama_id, status);

-- financial_ledger: admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_ledger_source ON public.financial_ledger (source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_type_date ON public.financial_ledger (transaction_type, created_at DESC);

-- notifications: user notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, is_read, created_at DESC);

-- payout_skips: skip history
CREATE INDEX IF NOT EXISTS idx_payout_skips_chama ON public.payout_skips (chama_id, created_at DESC);

-- payout_approval_requests: cycle lookup
CREATE INDEX IF NOT EXISTS idx_payout_approvals_cycle ON public.payout_approval_requests (cycle_id, status);

-- chama_overpayment_wallet: pending wallet entries
CREATE INDEX IF NOT EXISTS idx_wallet_chama_status ON public.chama_overpayment_wallet (chama_id, status);
