
-- 1. Table
CREATE TABLE public.daily_limit_increase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  current_limit numeric NOT NULL DEFAULT 150000,
  requested_limit numeric NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  otp_verified_at timestamptz,
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.daily_limit_increase_requests TO authenticated;
GRANT ALL ON public.daily_limit_increase_requests TO service_role;

ALTER TABLE public.daily_limit_increase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own limit requests"
  ON public.daily_limit_increase_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users insert own limit requests"
  ON public.daily_limit_increase_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update limit requests"
  ON public.daily_limit_increase_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_dlir_user ON public.daily_limit_increase_requests(user_id);
CREATE INDEX idx_dlir_status ON public.daily_limit_increase_requests(status);

CREATE TRIGGER update_dlir_updated_at
  BEFORE UPDATE ON public.daily_limit_increase_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Profiles columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_daily_limit numeric,
  ADD COLUMN IF NOT EXISTS custom_daily_limit_expires_at timestamptz;
