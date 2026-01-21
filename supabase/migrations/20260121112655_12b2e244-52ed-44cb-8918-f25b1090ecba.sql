-- Drop and recreate generate_group_code function to remove savings_groups reference
DROP FUNCTION IF EXISTS generate_group_code() CASCADE;

CREATE OR REPLACE FUNCTION generate_group_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers that use this function
CREATE TRIGGER set_chama_group_code
  BEFORE INSERT ON chama
  FOR EACH ROW
  WHEN (NEW.group_code IS NULL)
  EXECUTE FUNCTION generate_group_code();

CREATE TRIGGER set_organization_group_code
  BEFORE INSERT ON organizations
  FOR EACH ROW
  WHEN (NEW.group_code IS NULL)
  EXECUTE FUNCTION generate_group_code();