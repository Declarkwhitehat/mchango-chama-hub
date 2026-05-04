-- Prevent users from changing phone or id_number on their own profile after they are set.
-- Admins (via has_role) and the service role (auth.uid() IS NULL) bypass this restriction.

CREATE OR REPLACE FUNCTION public.prevent_identity_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- Service role / backend functions: caller is NULL → allow
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admin override
  v_is_admin := public.has_role(v_caller, 'admin'::app_role);
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Block phone change once set
  IF OLD.phone IS NOT NULL
     AND btrim(OLD.phone) <> ''
     AND NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'Phone number cannot be changed. Please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Block id_number change once set
  IF OLD.id_number IS NOT NULL
     AND btrim(OLD.id_number) <> ''
     AND NEW.id_number IS DISTINCT FROM OLD.id_number THEN
    RAISE EXCEPTION 'ID number cannot be changed. Please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_identity_changes ON public.profiles;

CREATE TRIGGER trg_prevent_identity_changes
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_identity_changes();