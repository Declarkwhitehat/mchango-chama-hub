-- Fix search_path security warning
CREATE OR REPLACE FUNCTION validate_mchango_managers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check that managers array doesn't exceed 2 additional managers
  IF array_length(NEW.managers, 1) > 2 THEN
    RAISE EXCEPTION 'Maximum of 2 additional managers allowed (plus creator)';
  END IF;
  
  -- Ensure creator is not in managers array
  IF NEW.created_by = ANY(NEW.managers) THEN
    RAISE EXCEPTION 'Creator is automatically a manager and should not be in managers array';
  END IF;
  
  RETURN NEW;
END;
$$;