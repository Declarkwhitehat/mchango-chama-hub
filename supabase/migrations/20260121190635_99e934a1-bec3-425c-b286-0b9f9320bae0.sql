-- Drop the duplicate trigger that's causing the conflict
-- The 'set_chama_group_code' trigger tries to call generate_group_code() as a trigger
-- but 'before_chama_insert_group_code' already handles this via assign_chama_group_code()
DROP TRIGGER IF EXISTS set_chama_group_code ON public.chama;

-- Also fix assign_chama_group_code to generate the code inline instead of calling the trigger function
CREATE OR REPLACE FUNCTION public.assign_chama_group_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  IF NEW.group_code IS NULL THEN
    LOOP
      -- Generate a random 6-character alphanumeric code
      new_code := upper(substring(md5(random()::text) from 1 for 6));
      
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;