-- 1. Super-admin role check (SECURITY DEFINER, no RLS recursion)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::public.app_role
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- 2. Seed: promote the existing admin to super_admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('d8e34397-ba8c-4e33-b556-34965d4a269d', 'super_admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Lock down user_roles INSERT/DELETE for admin/super_admin rows
DROP POLICY IF EXISTS "Only super admin can grant elevated roles" ON public.user_roles;
CREATE POLICY "Only super admin can grant elevated roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  role NOT IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Only super admin can revoke elevated roles" ON public.user_roles;
CREATE POLICY "Only super admin can revoke elevated roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  role NOT IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  OR public.is_super_admin(auth.uid())
);

-- 4. Admin Action Log table
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action_key text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_log_created_at_idx ON public.admin_action_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_log_actor_idx ON public.admin_action_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_log_action_idx ON public.admin_action_log (action_key, created_at DESC);

GRANT SELECT ON public.admin_action_log TO authenticated;
GRANT ALL ON public.admin_action_log TO service_role;

ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin can read admin action log" ON public.admin_action_log;
CREATE POLICY "Super admin can read admin action log"
ON public.admin_action_log
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Direct INSERT blocked; only via SECURITY DEFINER RPC below.

-- 5. Logging RPC (any authenticated admin call lands here)
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_key text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.admin_action_log (
    actor_user_id, actor_email, action_key, target_type, target_id, metadata, ip_address, user_agent
  ) VALUES (
    auth.uid(), _email, _action_key, _target_type, _target_id, COALESCE(_metadata, '{}'::jsonb), _ip_address, _user_agent
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb, text, text) TO authenticated, service_role;

-- 6. Auto-log role grants/revokes on user_roles
CREATE OR REPLACE FUNCTION public.audit_user_roles_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_email text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)) THEN
    SELECT email INTO _actor_email FROM public.profiles WHERE id = _actor;
    INSERT INTO public.admin_action_log (actor_user_id, actor_email, action_key, target_type, target_id, metadata)
    VALUES (_actor, _actor_email, 'user_role.grant', 'user', NEW.user_id::text, jsonb_build_object('role', NEW.role::text));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE' AND OLD.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)) THEN
    SELECT email INTO _actor_email FROM public.profiles WHERE id = _actor;
    INSERT INTO public.admin_action_log (actor_user_id, actor_email, action_key, target_type, target_id, metadata)
    VALUES (_actor, _actor_email, 'user_role.revoke', 'user', OLD.user_id::text, jsonb_build_object('role', OLD.role::text));
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_roles_audit_trg ON public.user_roles;
CREATE TRIGGER user_roles_audit_trg
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_changes();