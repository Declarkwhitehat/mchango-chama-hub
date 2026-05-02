-- Track member-initiated leave requests that require manager approval
CREATE TABLE IF NOT EXISTS public.welfare_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_id uuid NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.welfare_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one pending leave request per (welfare_id, member_id)
CREATE UNIQUE INDEX IF NOT EXISTS welfare_leave_requests_unique_pending
  ON public.welfare_leave_requests(welfare_id, member_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS welfare_leave_requests_welfare_status_idx
  ON public.welfare_leave_requests(welfare_id, status);

ALTER TABLE public.welfare_leave_requests ENABLE ROW LEVEL SECURITY;

-- Members can view their own requests
CREATE POLICY "Members can view own leave requests"
ON public.welfare_leave_requests
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Active managers (chairman/secretary/treasurer) can view requests in their welfare
CREATE POLICY "Managers can view welfare leave requests"
ON public.welfare_leave_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.welfare_members wm
    WHERE wm.welfare_id = welfare_leave_requests.welfare_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active'
      AND wm.role IN ('chairman','secretary','treasurer')
  )
);

-- Admins can view everything
CREATE POLICY "Admins can view all leave requests"
ON public.welfare_leave_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Members can create their own leave request (must be the member of record)
CREATE POLICY "Members can create own leave request"
ON public.welfare_leave_requests
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.welfare_members wm
    WHERE wm.id = welfare_leave_requests.member_id
      AND wm.user_id = auth.uid()
      AND wm.welfare_id = welfare_leave_requests.welfare_id
      AND wm.status = 'active'
      AND wm.role <> 'chairman'
  )
);

-- Members can cancel their own pending request
CREATE POLICY "Members can cancel own pending request"
ON public.welfare_leave_requests
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status IN ('pending','cancelled'));

-- Active managers can decide (approve/reject) on requests in their welfare
CREATE POLICY "Managers can decide leave requests"
ON public.welfare_leave_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.welfare_members wm
    WHERE wm.welfare_id = welfare_leave_requests.welfare_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active'
      AND wm.role IN ('chairman','secretary','treasurer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.welfare_members wm
    WHERE wm.welfare_id = welfare_leave_requests.welfare_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active'
      AND wm.role IN ('chairman','secretary','treasurer')
  )
);

CREATE TRIGGER update_welfare_leave_requests_updated_at
BEFORE UPDATE ON public.welfare_leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- When a leave request is approved, mark the welfare member as 'left'
CREATE OR REPLACE FUNCTION public.apply_welfare_leave_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    UPDATE public.welfare_members
    SET status = 'left'
    WHERE id = NEW.member_id;

    NEW.decided_at := COALESCE(NEW.decided_at, now());
    NEW.decided_by := COALESCE(NEW.decided_by, auth.uid());
  ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    NEW.decided_at := COALESCE(NEW.decided_at, now());
    NEW.decided_by := COALESCE(NEW.decided_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_welfare_leave_decision
BEFORE UPDATE ON public.welfare_leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.apply_welfare_leave_decision();