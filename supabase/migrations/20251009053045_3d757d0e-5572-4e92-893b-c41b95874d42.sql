-- Update the creator trigger to set approval_status='approved' and order_index=1
DROP FUNCTION IF EXISTS public.add_creator_as_manager() CASCADE;

CREATE OR REPLACE FUNCTION public.add_creator_as_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_code_val text;
BEGIN
  -- Generate unique member code for creator (order 1)
  member_code_val := substring(NEW.slug from 1 for 10) || '-M001';
  
  -- Insert creator as first member and manager with approved status
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

-- Recreate trigger
CREATE TRIGGER on_chama_created
  AFTER INSERT ON public.chama
  FOR EACH ROW
  EXECUTE FUNCTION public.add_creator_as_manager();