
-- 1) Lock down self-update on profiles: prevent KYC/verification self-escalation
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.prevent_kyc_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := false;
BEGIN
  -- Service role bypass: when there is no auth.uid(), it's service-role/DB
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Force protected columns to OLD values for non-admin self-updates
  NEW.kyc_status        := OLD.kyc_status;
  NEW.is_verified       := OLD.is_verified;
  NEW.kyc_submitted_at  := OLD.kyc_submitted_at;
  NEW.kyc_reviewed_at   := OLD.kyc_reviewed_at;
  NEW.kyc_reviewed_by   := OLD.kyc_reviewed_by;
  NEW.kyc_rejection_reason := OLD.kyc_rejection_reason;
  NEW.verified_at       := OLD.verified_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_kyc_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_kyc_self_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_kyc_self_escalation();

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 2) Public-readable maintenance flags
CREATE POLICY "Anyone can read maintenance flags"
ON public.platform_settings
FOR SELECT
TO anon, authenticated
USING (setting_key IN ('maintenance_mode','maintenance_title','maintenance_message'));

GRANT SELECT ON public.platform_settings TO anon;

-- 3) Reset Simon Karanja KYC state
UPDATE public.profiles
SET kyc_status = 'pending',
    is_verified = false,
    verified_at = NULL,
    kyc_reviewed_at = NULL,
    kyc_reviewed_by = NULL
WHERE id = 'c523c26f-0ab4-4e4d-a4ce-923b4f38898a';
