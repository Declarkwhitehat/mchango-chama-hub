-- Update the trigger function to preserve existing member_code values
-- and only generate new codes when order_index is available and member_code is not set
CREATE OR REPLACE FUNCTION public.update_chama_member_short_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_code TEXT;
BEGIN
  -- Only generate a short member code if:
  -- 1. member_code is not already set (preserve edge function generated codes)
  -- 2. group_code exists
  -- 3. order_index is available (not null)
  IF NEW.member_code IS NULL THEN
    SELECT group_code INTO v_group_code FROM chama WHERE id = NEW.chama_id;
    
    IF v_group_code IS NOT NULL AND NEW.order_index IS NOT NULL THEN
      NEW.member_code := generate_short_member_code(v_group_code, NEW.order_index);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;