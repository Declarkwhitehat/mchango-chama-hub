CREATE TABLE public.welfare_next_of_kin (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  welfare_id UUID NOT NULL,
  member_id UUID,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  relationship TEXT NOT NULL,
  relationship_other TEXT,
  gender TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT welfare_next_of_kin_unique UNIQUE (welfare_id, user_id),
  CONSTRAINT welfare_next_of_kin_gender_chk CHECK (gender IN ('male','female'))
);

CREATE INDEX idx_welfare_next_of_kin_welfare ON public.welfare_next_of_kin(welfare_id);
CREATE INDEX idx_welfare_next_of_kin_user ON public.welfare_next_of_kin(user_id);

GRANT SELECT, INSERT, UPDATE ON public.welfare_next_of_kin TO authenticated;
GRANT ALL ON public.welfare_next_of_kin TO service_role;

ALTER TABLE public.welfare_next_of_kin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members insert their own next of kin"
ON public.welfare_next_of_kin FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members view their own next of kin"
ON public.welfare_next_of_kin FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins view all next of kin"
ON public.welfare_next_of_kin FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Members update own next of kin after lock"
ON public.welfare_next_of_kin FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND locked_until <= now())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_next_of_kin_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.locked_until > now() THEN
    RAISE EXCEPTION 'Next of kin details are locked until %', to_char(OLD.locked_until, 'DD Mon YYYY');
  END IF;
  NEW.user_id := OLD.user_id;
  NEW.welfare_id := OLD.welfare_id;
  NEW.locked_until := now() + interval '90 days';
  NEW.acknowledged_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_next_of_kin_lock
BEFORE UPDATE ON public.welfare_next_of_kin
FOR EACH ROW EXECUTE FUNCTION public.enforce_next_of_kin_lock();

CREATE OR REPLACE FUNCTION public.set_next_of_kin_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.locked_until := now() + interval '90 days';
  NEW.acknowledged_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_next_of_kin_defaults
BEFORE INSERT ON public.welfare_next_of_kin
FOR EACH ROW EXECUTE FUNCTION public.set_next_of_kin_defaults();