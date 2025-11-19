-- Phase 1: Add Group Code Columns and Generate Functions

-- Add group_code column to chama table
ALTER TABLE chama ADD COLUMN IF NOT EXISTS group_code TEXT UNIQUE;

-- Add group_code column to saving_groups table
ALTER TABLE saving_groups ADD COLUMN IF NOT EXISTS group_code TEXT UNIQUE;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_chama_group_code ON chama(group_code);
CREATE INDEX IF NOT EXISTS idx_saving_groups_group_code ON saving_groups(group_code);

-- Function to generate unique 3-character group codes
CREATE OR REPLACE FUNCTION generate_group_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 3-character code (uppercase letters only for readability)
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 3));
    -- Remove numbers, keep only letters
    v_code := regexp_replace(v_code, '[0-9]', '', 'g');
    
    -- Ensure we have 3 characters
    IF length(v_code) < 3 THEN
      CONTINUE;
    END IF;
    
    v_code := substring(v_code from 1 for 3);
    
    -- Check if code exists in either table
    SELECT EXISTS(
      SELECT 1 FROM chama WHERE group_code = v_code
      UNION
      SELECT 1 FROM saving_groups WHERE group_code = v_code
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- Function to generate short member codes: GroupCode + MemberNumber
CREATE OR REPLACE FUNCTION generate_short_member_code(p_group_code TEXT, p_member_number INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_group_code || p_member_number::TEXT;
END;
$$;

-- Trigger function to assign group code to chama on insert
CREATE OR REPLACE FUNCTION assign_chama_group_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.group_code IS NULL THEN
    NEW.group_code := generate_group_code();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function to assign group code to saving_groups on insert
CREATE OR REPLACE FUNCTION assign_savings_group_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.group_code IS NULL THEN
    NEW.group_code := generate_group_code();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function to update chama member code with new short format
CREATE OR REPLACE FUNCTION update_chama_member_short_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_code TEXT;
BEGIN
  -- Get group code from chama
  SELECT group_code INTO v_group_code FROM chama WHERE id = NEW.chama_id;
  
  -- Generate short member code: GroupCode + OrderIndex
  IF v_group_code IS NOT NULL THEN
    NEW.member_code := generate_short_member_code(v_group_code, NEW.order_index);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function to update savings group member code with new short format
CREATE OR REPLACE FUNCTION update_savings_member_short_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_code TEXT;
  v_member_count INTEGER;
BEGIN
  -- Get group code from saving_groups
  SELECT group_code INTO v_group_code FROM saving_groups WHERE id = NEW.group_id;
  
  -- Count existing members to get member number
  SELECT COUNT(*) INTO v_member_count 
  FROM saving_group_members 
  WHERE group_id = NEW.group_id;
  
  -- Generate short member code: GroupCode + MemberNumber
  IF v_group_code IS NOT NULL THEN
    NEW.unique_member_id := generate_short_member_code(v_group_code, v_member_count + 1);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers for chama
DROP TRIGGER IF EXISTS before_chama_insert_group_code ON chama;
CREATE TRIGGER before_chama_insert_group_code
BEFORE INSERT ON chama
FOR EACH ROW
EXECUTE FUNCTION assign_chama_group_code();

DROP TRIGGER IF EXISTS before_chama_member_insert_short_code ON chama_members;
CREATE TRIGGER before_chama_member_insert_short_code
BEFORE INSERT ON chama_members
FOR EACH ROW
EXECUTE FUNCTION update_chama_member_short_code();

-- Create triggers for saving_groups
DROP TRIGGER IF EXISTS before_saving_group_insert_group_code ON saving_groups;
CREATE TRIGGER before_saving_group_insert_group_code
BEFORE INSERT ON saving_groups
FOR EACH ROW
EXECUTE FUNCTION assign_savings_group_code();

DROP TRIGGER IF EXISTS before_savings_member_insert_short_code ON saving_group_members;
CREATE TRIGGER before_savings_member_insert_short_code
BEFORE INSERT ON saving_group_members
FOR EACH ROW
EXECUTE FUNCTION update_savings_member_short_code();

-- Backfill existing chamas with group codes
UPDATE chama 
SET group_code = generate_group_code() 
WHERE group_code IS NULL;

-- Backfill existing saving_groups with group codes
UPDATE saving_groups 
SET group_code = generate_group_code() 
WHERE group_code IS NULL;

-- Backfill existing chama_members with new short member codes
UPDATE chama_members cm
SET member_code = (
  SELECT generate_short_member_code(c.group_code, cm.order_index)
  FROM chama c
  WHERE c.id = cm.chama_id
)
WHERE EXISTS (
  SELECT 1 FROM chama c 
  WHERE c.id = cm.chama_id AND c.group_code IS NOT NULL
);

-- Backfill existing saving_group_members with new short member codes
WITH numbered_members AS (
  SELECT 
    id,
    group_id,
    ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY joined_at) as member_number
  FROM saving_group_members
)
UPDATE saving_group_members sgm
SET unique_member_id = (
  SELECT generate_short_member_code(sg.group_code, nm.member_number::INTEGER)
  FROM saving_groups sg
  JOIN numbered_members nm ON nm.id = sgm.id AND nm.group_id = sgm.group_id
  WHERE sg.id = sgm.group_id
)
WHERE EXISTS (
  SELECT 1 FROM saving_groups sg 
  WHERE sg.id = sgm.group_id AND sg.group_code IS NOT NULL
);