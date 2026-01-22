-- Update generate_group_code() trigger function to create 4-character codes
CREATE OR REPLACE FUNCTION public.generate_group_code()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  LOOP
    new_code := '';
    FOR i IN 1..4 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    -- Check if the code already exists in chama or organizations tables
    SELECT EXISTS (
      SELECT 1 FROM chama WHERE group_code = new_code
      UNION ALL
      SELECT 1 FROM organizations WHERE group_code = new_code
    ) INTO code_exists;
    
    -- If the code doesn't exist, use it
    IF NOT code_exists THEN
      NEW.group_code := new_code;
      EXIT;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Update assign_chama_group_code() to generate 4-character codes
CREATE OR REPLACE FUNCTION public.assign_chama_group_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF NEW.group_code IS NULL THEN
    LOOP
      new_code := '';
      FOR i IN 1..4 LOOP
        new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      
      -- Check if the code already exists in chama or organizations tables
      SELECT EXISTS (
        SELECT 1 FROM chama WHERE group_code = new_code
        UNION ALL
        SELECT 1 FROM organizations WHERE group_code = new_code
      ) INTO code_exists;
      
      -- If the code doesn't exist, use it
      IF NOT code_exists THEN
        NEW.group_code := new_code;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update update_chama_member_short_code() to generate composite 8-char codes (4-char chama + 4-char member)
CREATE OR REPLACE FUNCTION public.update_chama_member_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group_code TEXT;
  v_member_suffix TEXT;
  v_full_code TEXT;
  v_exists BOOLEAN;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_max_attempts INTEGER := 50;
  v_attempt INTEGER := 0;
BEGIN
  -- Only generate a code if member_code is NULL
  IF NEW.member_code IS NULL THEN
    -- Get the chama's group code
    SELECT group_code INTO v_group_code FROM chama WHERE id = NEW.chama_id;
    
    IF v_group_code IS NOT NULL THEN
      LOOP
        v_attempt := v_attempt + 1;
        v_member_suffix := '';
        
        -- Generate 4-character member suffix
        FOR i IN 1..4 LOOP
          v_member_suffix := v_member_suffix || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;
        
        v_full_code := v_group_code || v_member_suffix;
        
        -- Check uniqueness within this chama
        SELECT EXISTS(
          SELECT 1 FROM chama_members WHERE chama_id = NEW.chama_id AND member_code = v_full_code
        ) INTO v_exists;
        
        EXIT WHEN NOT v_exists OR v_attempt >= v_max_attempts;
      END LOOP;
      
      NEW.member_code := v_full_code;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update generate_member_code() function to use the new format
CREATE OR REPLACE FUNCTION public.generate_member_code(p_chama_id uuid, p_order_index integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group_code TEXT;
  v_member_suffix TEXT;
  v_full_code TEXT;
  v_exists BOOLEAN;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_max_attempts INTEGER := 50;
  v_attempt INTEGER := 0;
BEGIN
  -- Get chama group code
  SELECT group_code INTO v_group_code FROM chama WHERE id = p_chama_id;
  
  IF v_group_code IS NULL THEN
    -- Fallback if no group code exists
    RETURN 'TEMP' || substr(md5(random()::text), 1, 4);
  END IF;
  
  LOOP
    v_attempt := v_attempt + 1;
    v_member_suffix := '';
    
    -- Generate 4-character member suffix
    FOR i IN 1..4 LOOP
      v_member_suffix := v_member_suffix || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    
    v_full_code := v_group_code || v_member_suffix;
    
    -- Check uniqueness within this chama
    SELECT EXISTS(
      SELECT 1 FROM chama_members WHERE chama_id = p_chama_id AND member_code = v_full_code
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists OR v_attempt >= v_max_attempts;
  END LOOP;
  
  RETURN v_full_code;
END;
$function$;

-- Update generate_short_member_code() to generate 4-char suffix
CREATE OR REPLACE FUNCTION public.generate_short_member_code(p_group_code text, p_member_number integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_suffix TEXT := '';
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  -- Generate 4-character random suffix instead of using member number
  FOR i IN 1..4 LOOP
    v_member_suffix := v_member_suffix || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
  END LOOP;
  
  RETURN p_group_code || v_member_suffix;
END;
$function$;