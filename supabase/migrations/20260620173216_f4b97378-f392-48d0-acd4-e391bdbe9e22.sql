
CREATE INDEX IF NOT EXISTS idx_contributions_chama_created
  ON public.contributions (chama_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_cycle_payments_cycle
  ON public.member_cycle_payments (cycle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_welfare_contributions_welfare_created
  ON public.welfare_contributions (welfare_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mchango_donations_mchango_created
  ON public.mchango_donations (mchango_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_donations_org_created
  ON public.organization_donations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_by_status
  ON public.withdrawals (requested_by, status);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created
  ON public.withdrawals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications (user_id, is_read, created_at DESC);

ANALYZE public.contributions;
ANALYZE public.welfare_contributions;
ANALYZE public.mchango_donations;
ANALYZE public.withdrawals;
ANALYZE public.audit_logs;
ANALYZE public.notifications;
