
-- 1. Add is_official flag on mchango for admin-pinned campaigns
ALTER TABLE public.mchango
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mchango_is_official_created_at
  ON public.mchango (is_official DESC, created_at DESC);

-- 2. Trigger: when an admin creates an mchango, auto-mark it as official
CREATE OR REPLACE FUNCTION public.set_mchango_official_for_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND public.has_role(NEW.created_by, 'admin'::app_role) THEN
    NEW.is_official := true;
    NEW.is_verified := true;
    NEW.creator_is_verified := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_mchango_official_for_admin_trg ON public.mchango;
CREATE TRIGGER set_mchango_official_for_admin_trg
  BEFORE INSERT ON public.mchango
  FOR EACH ROW
  EXECUTE FUNCTION public.set_mchango_official_for_admin();

-- 3. Backfill existing admin-created campaigns
UPDATE public.mchango m
   SET is_official = true
 WHERE is_official = false
   AND public.has_role(m.created_by, 'admin'::app_role);

-- 4. Admin SMS broadcast log table
CREATE TABLE IF NOT EXISTS public.admin_sms_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  segment text NOT NULL,
  message text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.admin_sms_broadcasts TO authenticated;
GRANT ALL ON public.admin_sms_broadcasts TO service_role;

ALTER TABLE public.admin_sms_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view broadcasts"
  ON public.admin_sms_broadcasts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert broadcasts"
  ON public.admin_sms_broadcasts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND admin_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_admin_sms_broadcasts_created_at
  ON public.admin_sms_broadcasts (created_at DESC);
