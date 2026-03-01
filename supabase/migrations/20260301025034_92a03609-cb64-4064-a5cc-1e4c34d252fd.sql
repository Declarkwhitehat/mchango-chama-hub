
-- Update add_creator_as_manager() to use sequential format: GROUP_CODE + M + 0001
CREATE OR REPLACE FUNCTION public.add_creator_as_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_code_val text;
  v_group_code text;
BEGIN
  -- Get the chama's group code (set by assign_chama_group_code trigger which fires BEFORE INSERT)
  v_group_code := NEW.group_code;
  
  IF v_group_code IS NOT NULL THEN
    member_code_val := v_group_code || 'M0001';
  ELSE
    -- Fallback using slug
    member_code_val := upper(substring(NEW.slug from 1 for 4)) || 'M0001';
  END IF;
  
  INSERT INTO public.chama_members (
    chama_id,
    user_id,
    is_manager,
    member_code,
    order_index,
    status,
    approval_status
  ) VALUES (
    NEW.id,
    NEW.created_by,
    true,
    member_code_val,
    1,
    'active',
    'approved'
  );
  
  RETURN NEW;
END;
$$;

-- Update update_chama_member_short_code() trigger to use sequential M-prefixed format
CREATE OR REPLACE FUNCTION public.update_chama_member_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group_code TEXT;
  v_next_number INTEGER;
  v_full_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Only generate a code if member_code is NULL
  IF NEW.member_code IS NULL THEN
    -- Get the chama's group code
    SELECT group_code INTO v_group_code FROM chama WHERE id = NEW.chama_id;
    
    IF v_group_code IS NOT NULL THEN
      -- Find the next sequential number by looking at existing member codes
      SELECT COALESCE(MAX(
        CASE 
          WHEN member_code ~ ('^' || v_group_code || 'M[0-9]+$')
          THEN CAST(substring(member_code from length(v_group_code) + 2) AS INTEGER)
          ELSE 0
        END
      ), 0) + 1
      INTO v_next_number
      FROM chama_members
      WHERE chama_id = NEW.chama_id;
      
      v_full_code := v_group_code || 'M' || lpad(v_next_number::text, 4, '0');
      
      -- Ensure uniqueness (in case of edge cases)
      SELECT EXISTS(
        SELECT 1 FROM chama_members WHERE chama_id = NEW.chama_id AND member_code = v_full_code
      ) INTO v_exists;
      
      -- If exists, increment until unique
      WHILE v_exists LOOP
        v_next_number := v_next_number + 1;
        v_full_code := v_group_code || 'M' || lpad(v_next_number::text, 4, '0');
        SELECT EXISTS(
          SELECT 1 FROM chama_members WHERE chama_id = NEW.chama_id AND member_code = v_full_code
        ) INTO v_exists;
      END LOOP;
      
      NEW.member_code := v_full_code;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update generate_member_code() function to use sequential format
CREATE OR REPLACE FUNCTION public.generate_member_code(p_chama_id uuid, p_order_index integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group_code TEXT;
  v_next_number INTEGER;
  v_full_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Get chama group code
  SELECT group_code INTO v_group_code FROM chama WHERE id = p_chama_id;
  
  IF v_group_code IS NULL THEN
    RETURN 'TEMP' || substr(md5(random()::text), 1, 4);
  END IF;
  
  -- Find the next sequential number
  SELECT COALESCE(MAX(
    CASE 
      WHEN member_code ~ ('^' || v_group_code || 'M[0-9]+$')
      THEN CAST(substring(member_code from length(v_group_code) + 2) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_next_number
  FROM chama_members
  WHERE chama_id = p_chama_id;
  
  v_full_code := v_group_code || 'M' || lpad(v_next_number::text, 4, '0');
  
  -- Ensure uniqueness
  SELECT EXISTS(
    SELECT 1 FROM chama_members WHERE chama_id = p_chama_id AND member_code = v_full_code
  ) INTO v_exists;
  
  WHILE v_exists LOOP
    v_next_number := v_next_number + 1;
    v_full_code := v_group_code || 'M' || lpad(v_next_number::text, 4, '0');
    SELECT EXISTS(
      SELECT 1 FROM chama_members WHERE chama_id = p_chama_id AND member_code = v_full_code
    ) INTO v_exists;
  END LOOP;
  
  RETURN v_full_code;
END;
$function$;

-- Update generate_short_member_code() to use sequential format
CREATE OR REPLACE FUNCTION public.generate_short_member_code(p_group_code text, p_member_number integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN p_group_code || 'M' || lpad(p_member_number::text, 4, '0');
END;
$function$;

-- Backfill existing chama members with new sequential format
DO $$
DECLARE
  r RECORD;
  v_group_code TEXT;
  v_counter INTEGER;
  v_chama_id UUID;
BEGIN
  -- Process each chama
  FOR v_chama_id IN SELECT DISTINCT id FROM chama LOOP
    SELECT group_code INTO v_group_code FROM chama WHERE id = v_chama_id;
    
    IF v_group_code IS NOT NULL THEN
      v_counter := 0;
      -- Update members in order_index order, then joined_at order
      FOR r IN 
        SELECT id FROM chama_members 
        WHERE chama_id = v_chama_id 
        ORDER BY COALESCE(order_index, 99999), joined_at
      LOOP
        v_counter := v_counter + 1;
        UPDATE chama_members 
        SET member_code = v_group_code || 'M' || lpad(v_counter::text, 4, '0')
        WHERE id = r.id;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
