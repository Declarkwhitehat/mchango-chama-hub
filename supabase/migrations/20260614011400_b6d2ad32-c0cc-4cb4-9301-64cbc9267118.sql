CREATE OR REPLACE FUNCTION public.prevent_kyc_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean := false;
BEGIN
  -- Service role bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admins: NEVER allow self-approval/verification or admin-review fields
  NEW.is_verified          := OLD.is_verified;
  NEW.verified_at          := OLD.verified_at;
  NEW.kyc_reviewed_at      := OLD.kyc_reviewed_at;
  NEW.kyc_reviewed_by      := OLD.kyc_reviewed_by;
  NEW.kyc_rejection_reason := OLD.kyc_rejection_reason;

  -- Allow user to (re)submit KYC: NULL/rejected -> pending only.
  -- Block any other transition (e.g., setting approved, or pending->approved).
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    IF NEW.kyc_status = 'pending'::kyc_status
       AND (OLD.kyc_status IS NULL OR OLD.kyc_status = 'rejected'::kyc_status) THEN
      -- permitted self-submission; allow kyc_submitted_at to update
      NULL;
    ELSE
      NEW.kyc_status       := OLD.kyc_status;
      NEW.kyc_submitted_at := OLD.kyc_submitted_at;
    END IF;
  ELSIF NEW.kyc_submitted_at IS DISTINCT FROM OLD.kyc_submitted_at
        AND OLD.kyc_status NOT IN ('pending'::kyc_status, 'rejected'::kyc_status)
        AND OLD.kyc_status IS NOT NULL THEN
    -- Don't let user touch submitted_at once approved
    NEW.kyc_submitted_at := OLD.kyc_submitted_at;
  END IF;

  RETURN NEW;
END;
$function$;