-- Atomic signup uniqueness reservation with transaction-scoped advisory locks
CREATE OR REPLACE FUNCTION public.reserve_signup_identity(
  p_phone text,
  p_id_number text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text := lower(btrim(coalesce(p_phone, '')));
  v_id_norm    text := lower(btrim(coalesce(p_id_number, '')));
  v_email_norm text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_phone_norm = '' OR v_id_norm = '' OR v_email_norm = '' THEN
    RAISE EXCEPTION 'missing_identity_fields' USING ERRCODE = 'P0001';
  END IF;

  -- Transaction-scoped locks: any concurrent signup with the same identity blocks here
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:phone:' || v_phone_norm, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:id:'    || v_id_norm,    0));
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:email:' || v_email_norm, 0));

  IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = p_phone) THEN
    RAISE EXCEPTION 'phone_exists' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id_number = p_id_number) THEN
    RAISE EXCEPTION 'id_number_exists' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email_norm) THEN
    RAISE EXCEPTION 'email_exists' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_signup_identity(text, text, text) TO anon, authenticated;

-- Final safety net: ensure unique indexes exist on profiles
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON public.profiles (phone);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_number_key ON public.profiles (id_number);