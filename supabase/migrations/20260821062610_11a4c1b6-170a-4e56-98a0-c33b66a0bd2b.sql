CREATE OR REPLACE FUNCTION public.prevent_member_code_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Member IDs are permanent once issued. Payout order (order_index) may change
  -- freely, but the member_code must never be renumbered.
  IF OLD.member_code IS NOT NULL AND NEW.member_code IS DISTINCT FROM OLD.member_code THEN
    NEW.member_code := OLD.member_code;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_member_code_change ON public.chama_members;
CREATE TRIGGER trg_prevent_member_code_change
  BEFORE UPDATE ON public.chama_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_member_code_change();