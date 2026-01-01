-- Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  about TEXT,
  category TEXT NOT NULL,
  logo_url TEXT,
  cover_image_url TEXT,
  website_url TEXT,
  phone TEXT,
  email TEXT,
  location TEXT,
  whatsapp_link TEXT,
  youtube_url TEXT,
  current_amount NUMERIC NOT NULL DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  group_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create organization donations table
CREATE TABLE public.organization_donations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  amount NUMERIC NOT NULL,
  display_name TEXT,
  phone TEXT,
  email TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  payment_reference TEXT NOT NULL,
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_donations ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Anyone can view active public organizations"
ON public.organizations FOR SELECT
USING (status = 'active' AND is_public = true);

CREATE POLICY "Admins can view all organizations"
ON public.organizations FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "KYC approved users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.kyc_status = 'approved'
  )
);

CREATE POLICY "Creators can update their organizations"
ON public.organizations FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Admins can update organizations"
ON public.organizations FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete organizations"
ON public.organizations FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Organization donations policies
CREATE POLICY "Anyone can create donations"
ON public.organization_donations FOR INSERT
WITH CHECK (
  (user_id IS NULL) OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

CREATE POLICY "Organization creators can view donations"
ON public.organization_donations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organizations
    WHERE organizations.id = organization_donations.organization_id
    AND organizations.created_by = auth.uid()
  )
);

CREATE POLICY "Admins can view all donations"
ON public.organization_donations FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage donations"
ON public.organization_donations FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Function to generate organization group code
CREATE OR REPLACE FUNCTION public.generate_org_code()
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
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
    v_code := regexp_replace(v_code, '[01IL]', '', 'g');
    IF length(v_code) < 5 THEN CONTINUE; END IF;
    v_code := substring(v_code from 1 for 5);
    SELECT EXISTS(SELECT 1 FROM organizations WHERE group_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- Trigger to assign group code
CREATE OR REPLACE FUNCTION public.assign_org_group_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.group_code IS NULL THEN
    NEW.group_code := generate_org_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_org_code_trigger
BEFORE INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION assign_org_group_code();

-- Trigger to update organization amount on donation
CREATE OR REPLACE FUNCTION public.update_org_on_donation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'completed' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'completed') THEN
    UPDATE public.organizations
    SET current_amount = current_amount + NEW.amount
    WHERE id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_org_amount_trigger
AFTER INSERT OR UPDATE ON public.organization_donations
FOR EACH ROW EXECUTE FUNCTION update_org_on_donation();

-- Updated at trigger
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();