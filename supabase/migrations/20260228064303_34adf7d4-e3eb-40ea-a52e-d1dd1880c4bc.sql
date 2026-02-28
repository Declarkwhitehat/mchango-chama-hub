
CREATE OR REPLACE FUNCTION public.check_signup_uniqueness(p_phone text, p_id_number text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE phone = p_phone) THEN
    result := result || '{"phone_exists": true}';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id_number = p_id_number) THEN
    result := result || '{"id_number_exists": true}';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE email = p_email) THEN
    result := result || '{"email_exists": true}';
  END IF;
  RETURN result;
END;
$$;
