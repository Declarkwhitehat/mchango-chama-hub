-- Add paybill_account_id column to mchango table
ALTER TABLE public.mchango 
ADD COLUMN IF NOT EXISTS paybill_account_id TEXT UNIQUE;

-- Add paybill_account_id column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS paybill_account_id TEXT UNIQUE;

-- Create a function to generate globally unique paybill account IDs
-- Format: MC-XXXXXX for mchango, ORG-XXXXXX for organizations
CREATE OR REPLACE FUNCTION public.generate_paybill_account_id(entity_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_code TEXT;
  v_full_id TEXT;
  v_exists BOOLEAN;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  -- Set prefix based on entity type
  IF entity_type = 'mchango' THEN
    v_prefix := 'MC';
  ELSIF entity_type = 'organization' THEN
    v_prefix := 'ORG';
  ELSE
    RAISE EXCEPTION 'Invalid entity type: %', entity_type;
  END IF;

  LOOP
    -- Generate 6-character alphanumeric code
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    
    v_full_id := v_prefix || v_code;
    
    -- Check uniqueness across BOTH tables
    SELECT EXISTS(
      SELECT 1 FROM mchango WHERE paybill_account_id = v_full_id
      UNION ALL
      SELECT 1 FROM organizations WHERE paybill_account_id = v_full_id
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_full_id;
END;
$function$;

-- Create trigger function for mchango
CREATE OR REPLACE FUNCTION public.assign_mchango_paybill_account_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.paybill_account_id IS NULL THEN
    NEW.paybill_account_id := generate_paybill_account_id('mchango');
  END IF;
  RETURN NEW;
END;
$function$;

-- Create trigger function for organizations
CREATE OR REPLACE FUNCTION public.assign_org_paybill_account_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.paybill_account_id IS NULL THEN
    NEW.paybill_account_id := generate_paybill_account_id('organization');
  END IF;
  RETURN NEW;
END;
$function$;

-- Create triggers
DROP TRIGGER IF EXISTS assign_mchango_paybill_id ON mchango;
CREATE TRIGGER assign_mchango_paybill_id
  BEFORE INSERT ON mchango
  FOR EACH ROW
  EXECUTE FUNCTION assign_mchango_paybill_account_id();

DROP TRIGGER IF EXISTS assign_org_paybill_id ON organizations;
CREATE TRIGGER assign_org_paybill_id
  BEFORE INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION assign_org_paybill_account_id();

-- Backfill existing mchango records
UPDATE mchango 
SET paybill_account_id = generate_paybill_account_id('mchango')
WHERE paybill_account_id IS NULL;

-- Backfill existing organization records
UPDATE organizations 
SET paybill_account_id = generate_paybill_account_id('organization')
WHERE paybill_account_id IS NULL;

-- Add NOT NULL constraint after backfill
ALTER TABLE public.mchango 
ALTER COLUMN paybill_account_id SET NOT NULL;

ALTER TABLE public.organizations 
ALTER COLUMN paybill_account_id SET NOT NULL;

-- Create index for fast lookups during C2B callback
CREATE INDEX IF NOT EXISTS idx_mchango_paybill_account_id ON mchango(paybill_account_id);
CREATE INDEX IF NOT EXISTS idx_organizations_paybill_account_id ON organizations(paybill_account_id);