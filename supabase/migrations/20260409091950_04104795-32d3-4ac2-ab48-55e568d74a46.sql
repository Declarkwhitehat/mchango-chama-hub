-- Withdrawal duplicate guard: frequently checked in daily-payout-cron
CREATE INDEX IF NOT EXISTS idx_withdrawals_chama_cycle_status 
ON public.withdrawals (chama_id, cycle_id, status) 
WHERE cycle_id IS NOT NULL;

-- Contributions lookup by member + chama (used in contributions-crud settle)
CREATE INDEX IF NOT EXISTS idx_contributions_member_chama_status 
ON public.contributions (member_id, chama_id, status);

-- Mchango donations by user (Activity page)
CREATE INDEX IF NOT EXISTS idx_mchango_donations_user_created 
ON public.mchango_donations (user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Organization donations by user (Activity page)
CREATE INDEX IF NOT EXISTS idx_org_donations_user_created 
ON public.organization_donations (user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Withdrawals by requester (Activity page)
CREATE INDEX IF NOT EXISTS idx_withdrawals_requester_created 
ON public.withdrawals (requested_by, created_at DESC);

-- Notification feed index
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created 
ON public.notifications (user_id, is_read, created_at DESC);

-- Chama members: active members ordered (used in payout cron heavily)
CREATE INDEX IF NOT EXISTS idx_chama_members_active_ordered 
ON public.chama_members (chama_id, order_index) 
WHERE status = 'active' AND approval_status = 'approved';

-- Payout skips by chama + cycle
CREATE INDEX IF NOT EXISTS idx_payout_skips_chama_cycle 
ON public.payout_skips (chama_id, cycle_id);

-- Unpaid cycle payments (used by early-payout and member-dashboard)
CREATE INDEX IF NOT EXISTS idx_mcp_unpaid 
ON public.member_cycle_payments (cycle_id, member_id) 
WHERE fully_paid = false;

-- Settlement locks for concurrency
CREATE INDEX IF NOT EXISTS idx_settlement_locks_contribution 
ON public.settlement_locks (contribution_id);