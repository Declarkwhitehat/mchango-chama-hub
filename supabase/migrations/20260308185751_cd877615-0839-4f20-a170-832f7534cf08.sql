
-- Track executive role changes for welfare groups
CREATE TABLE public.welfare_executive_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_id UUID NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('role_assigned', 'role_removed', 'member_removed')),
  old_role TEXT,
  new_role TEXT,
  affected_member_id UUID,
  affected_user_name TEXT,
  new_member_id UUID,
  new_user_name TEXT,
  changed_by UUID REFERENCES public.profiles(id),
  cooldown_hours INTEGER NOT NULL DEFAULT 72,
  cooldown_ends_at TIMESTAMPTZ NOT NULL,
  admin_decision TEXT DEFAULT 'pending' CHECK (admin_decision IN ('pending', 'approved', 'rejected', 'frozen', 'auto_accepted')),
  admin_decided_at TIMESTAMPTZ,
  admin_decided_by UUID REFERENCES public.profiles(id),
  admin_notes TEXT,
  pending_withdrawals_cancelled INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.welfare_executive_changes ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins full access on welfare_executive_changes"
  ON public.welfare_executive_changes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Members can read changes for their welfare
CREATE POLICY "Members can view welfare executive changes"
  ON public.welfare_executive_changes FOR SELECT TO authenticated
  USING (public.is_welfare_member(auth.uid(), welfare_id));

-- Index for quick lookups
CREATE INDEX idx_welfare_exec_changes_welfare ON public.welfare_executive_changes(welfare_id, created_at DESC);
CREATE INDEX idx_welfare_exec_changes_pending ON public.welfare_executive_changes(admin_decision) WHERE admin_decision = 'pending';
