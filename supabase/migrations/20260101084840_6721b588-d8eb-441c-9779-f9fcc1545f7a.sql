-- Add group_code column to mchango table
ALTER TABLE public.mchango 
ADD COLUMN IF NOT EXISTS group_code TEXT UNIQUE;

-- Create function to generate unique mchango code (4 characters alphanumeric)
CREATE OR REPLACE FUNCTION public.generate_mchango_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 4-character alphanumeric code (uppercase)
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    -- Remove confusing characters (0, O, 1, I, L)
    v_code := regexp_replace(v_code, '[01IL]', '', 'g');
    
    -- Ensure we have 4 characters
    IF length(v_code) < 4 THEN
      CONTINUE;
    END IF;
    
    v_code := substring(v_code from 1 for 4);
    
    -- Check if code exists in mchango table
    SELECT EXISTS(SELECT 1 FROM mchango WHERE group_code = v_code) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- Create trigger to auto-generate mchango code on insert
CREATE OR REPLACE FUNCTION public.assign_mchango_group_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.group_code IS NULL THEN
    NEW.group_code := generate_mchango_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_assign_mchango_code ON public.mchango;
CREATE TRIGGER trigger_assign_mchango_code
  BEFORE INSERT ON public.mchango
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_mchango_group_code();

-- Backfill existing mchangos with codes
UPDATE public.mchango
SET group_code = generate_mchango_code()
WHERE group_code IS NULL;