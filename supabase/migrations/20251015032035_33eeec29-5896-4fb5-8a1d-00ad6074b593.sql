-- Create function to restrict max_members updates to admins only
CREATE OR REPLACE FUNCTION public.enforce_admin_max_members_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if max_members is not being changed
  IF OLD.max_members = NEW.max_members THEN
    RETURN NEW;
  END IF;

  -- Only allow admin users to change max_members
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can adjust member limits';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_max_members ON public.chama;

CREATE TRIGGER enforce_admin_max_members
  BEFORE UPDATE ON public.chama
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_admin_max_members_update();