
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS protected boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_protected_role_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.protected = true THEN
    RAISE EXCEPTION 'Cannot remove protected admin role. Unprotect first.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_protected_role_delete ON public.user_roles;
CREATE TRIGGER trg_prevent_protected_role_delete
BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_role_delete();

INSERT INTO public.user_roles (user_id, role, protected)
VALUES ('146e3f76-9bd7-42b0-88c9-5df9c90005c7', 'admin', true)
ON CONFLICT (user_id, role) DO UPDATE SET protected = true;
