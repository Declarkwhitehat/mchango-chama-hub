
-- 1. Profile verification columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- 2. creator_is_verified on entity tables
ALTER TABLE public.chama         ADD COLUMN IF NOT EXISTS creator_is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.mchango       ADD COLUMN IF NOT EXISTS creator_is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.welfares      ADD COLUMN IF NOT EXISTS creator_is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS creator_is_verified boolean NOT NULL DEFAULT false;

-- 3. Trigger: on entity insert, if creator is verified -> auto verify entity & set creator_is_verified
CREATE OR REPLACE FUNCTION public.apply_creator_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified boolean;
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(is_verified, false) INTO v_verified FROM profiles WHERE id = NEW.created_by;
  IF v_verified THEN
    NEW.creator_is_verified := true;
    BEGIN
      NEW.is_verified := true;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_creator_verification ON public.chama;
CREATE TRIGGER trg_apply_creator_verification BEFORE INSERT ON public.chama
  FOR EACH ROW EXECUTE FUNCTION public.apply_creator_verification();
DROP TRIGGER IF EXISTS trg_apply_creator_verification ON public.mchango;
CREATE TRIGGER trg_apply_creator_verification BEFORE INSERT ON public.mchango
  FOR EACH ROW EXECUTE FUNCTION public.apply_creator_verification();
DROP TRIGGER IF EXISTS trg_apply_creator_verification ON public.welfares;
CREATE TRIGGER trg_apply_creator_verification BEFORE INSERT ON public.welfares
  FOR EACH ROW EXECUTE FUNCTION public.apply_creator_verification();
DROP TRIGGER IF EXISTS trg_apply_creator_verification ON public.organizations;
CREATE TRIGGER trg_apply_creator_verification BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.apply_creator_verification();

-- 4. When profile flips to verified, propagate to existing entities
CREATE OR REPLACE FUNCTION public.propagate_profile_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_verified = true AND COALESCE(OLD.is_verified, false) = false THEN
    UPDATE public.chama         SET creator_is_verified = true, is_verified = true WHERE created_by = NEW.id;
    UPDATE public.mchango       SET creator_is_verified = true, is_verified = true WHERE created_by = NEW.id;
    UPDATE public.welfares      SET creator_is_verified = true, is_verified = true WHERE created_by = NEW.id;
    UPDATE public.organizations SET creator_is_verified = true, is_verified = true WHERE created_by = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_profile_verification ON public.profiles;
CREATE TRIGGER trg_propagate_profile_verification AFTER UPDATE OF is_verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.propagate_profile_verification();

-- 5. user_verification_requests
CREATE TABLE IF NOT EXISTS public.user_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  selfie_path text NOT NULL,
  fee_amount numeric NOT NULL DEFAULT 1500,
  payment_status text NOT NULL DEFAULT 'pending', -- pending|paid|failed
  payment_reference text,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ver_req_user ON public.user_verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ver_req_status ON public.user_verification_requests(status);

ALTER TABLE public.user_verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users select own verification" ON public.user_verification_requests;
CREATE POLICY "users select own verification" ON public.user_verification_requests
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "users insert own verification" ON public.user_verification_requests;
CREATE POLICY "users insert own verification" ON public.user_verification_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins manage verification" ON public.user_verification_requests;
CREATE POLICY "admins manage verification" ON public.user_verification_requests
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_uvr_updated_at ON public.user_verification_requests;
CREATE TRIGGER trg_uvr_updated_at BEFORE UPDATE ON public.user_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Storage bucket for selfies
INSERT INTO storage.buckets (id, name, public) VALUES ('verification-selfies', 'verification-selfies', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "selfie owner upload" ON storage.objects;
CREATE POLICY "selfie owner upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verification-selfies' AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "selfie owner read" ON storage.objects;
CREATE POLICY "selfie owner read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verification-selfies' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- 7. Platform setting for the user verification fee
INSERT INTO public.platform_settings (setting_key, setting_value)
VALUES ('user_verification_fee', '{"amount": 1500}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- 8. Backfill creator_is_verified from existing verified profiles (safe no-op if none yet)
UPDATE public.chama c SET creator_is_verified = true
  FROM public.profiles p WHERE p.id = c.created_by AND p.is_verified = true AND c.creator_is_verified = false;
UPDATE public.mchango m SET creator_is_verified = true
  FROM public.profiles p WHERE p.id = m.created_by AND p.is_verified = true AND m.creator_is_verified = false;
UPDATE public.welfares w SET creator_is_verified = true
  FROM public.profiles p WHERE p.id = w.created_by AND p.is_verified = true AND w.creator_is_verified = false;
UPDATE public.organizations o SET creator_is_verified = true
  FROM public.profiles p WHERE p.id = o.created_by AND p.is_verified = true AND o.creator_is_verified = false;
