CREATE OR REPLACE FUNCTION public.normalize_mchango_donation_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_mchango_donation_user_id ON public.mchango_donations;
CREATE TRIGGER trg_normalize_mchango_donation_user_id
BEFORE INSERT OR UPDATE ON public.mchango_donations
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mchango_donation_user_id();