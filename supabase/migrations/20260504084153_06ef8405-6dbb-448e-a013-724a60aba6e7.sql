CREATE OR REPLACE FUNCTION public.admin_clear_payout_default(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service_role boolean := (current_setting('request.jwt.claim.role', true) = 'service_role')
                             OR (current_setting('role', true) = 'service_role');
  v_is_admin boolean := false;
BEGIN
  -- Service role (e.g. simulator using SUPABASE_SERVICE_ROLE_KEY) bypasses the admin check.
  IF NOT v_is_service_role THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Primary check: user_roles table
    v_is_admin := public.has_role(v_caller, 'admin'::app_role);

    -- Fallback: check user_metadata.role / user_metadata.is_admin from auth.users
    IF NOT v_is_admin THEN
      SELECT
        COALESCE(
          (raw_user_meta_data ->> 'is_admin')::boolean,
          (raw_user_meta_data ->> 'role') = 'admin',
          false
        )
      INTO v_is_admin
      FROM auth.users
      WHERE id = v_caller;
    END IF;

    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Only administrators can clear payout default';
    END IF;
  END IF;

  UPDATE public.profiles
  SET has_payout_default = false,
      payout_default_cleared_at = now(),
      payout_default_cleared_by = COALESCE(v_caller, p_user_id)
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'cleared_by', v_caller,
    'service_role', v_is_service_role
  );
END;
$function$;